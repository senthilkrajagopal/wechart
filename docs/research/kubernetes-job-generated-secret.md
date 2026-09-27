---
library: kubernetes-job-generated-secret
packages: []
version: "Kubernetes v1.34.1 (core/v1, rbac.authorization.k8s.io/v1, batch/v1); Node.js 24.21.0; Helm 3.17.2"
researched: 2026-09-26
sources:
  - https://kubernetes.io/docs/tasks/run-application/access-api-from-pod/
  - https://kubernetes.io/docs/tasks/configure-pod-container/configure-service-account/
  - https://kubernetes.io/docs/reference/access-authn-authz/service-accounts-admin/
  - https://kubernetes.io/docs/reference/access-authn-authz/rbac/
  - https://kubernetes.io/docs/reference/access-authn-authz/authorization/
  - https://github.com/kubernetes/community/blob/master/contributors/devel/sig-architecture/api-conventions.md
  - https://kubernetes.io/docs/reference/kubernetes-api/config-and-storage-resources/secret-v1/
  - https://kubernetes.io/docs/reference/kubernetes-api/config-and-storage-resources/config-map-v1/
  - https://kubernetes.io/docs/concepts/configuration/secret/
  - https://kubernetes.io/docs/tasks/configure-pod-container/configure-pod-configmap/
  - https://kubernetes.io/docs/concepts/workloads/controllers/job/
  - https://kubernetes.io/docs/concepts/security/pod-security-standards/
  - https://github.com/kubernetes/kubernetes/tree/v1.34.1
  - https://helm.sh/docs/v3/topics/charts_hooks/
  - https://github.com/helm/helm/tree/v3.17.2
  - https://nodejs.org/docs/latest-v24.x/api/https.html
  - https://nodejs.org/docs/latest-v24.x/api/tls.html
  - https://nodejs.org/docs/latest-v24.x/api/cli.html
  - https://nodejs.org/docs/latest-v24.x/api/globals.html
---
# Kubernetes Job that generates xcube's credential key once (Kubernetes v1.34.1, Node.js 24.21.0)

The Kubernetes source I cite is pinned to v1.34.1, which is the docker-desktop cluster version recorded in `docs/research/helm.md`. The kubernetes.io pages are the current docs (they render as v1.37). The Helm source is pinned to v3.17.2, the CLI in `helm.md`. Node documentation is v24.21.0, the base of `node:24.21.0-trixie-slim` in the fork's Cube Dockerfile (`/Users/srajagopal/Work/bi/cube/packages/cubejs-docker/latest.Dockerfile` L26).

## Summary / recommendation

**Why this is needed**
- The API refuses to start without xcube's public JWK (AC-298, AC-324, per the comment at `/Users/srajagopal/Work/wechart/deploy/helm/wechart/values.yaml` L37-40).
- Helm's sprig cannot make X25519 keys (`docs/research/credential-sealing.md`, Gotcha 16).
- The decision is "Kubernetes Secrets, generated once by the chart". Nothing is installed (`packages: []`). The Job runs xcube's own image and uses only `node:` built-ins.

**Recommendation: a plain Helm-managed Job, not a hook.**
- Name it by its rendered pod template's hash, like `xcube-bootstrap.yaml` (`/Users/srajagopal/Work/wechart/deploy/helm/wechart/templates/xcube-bootstrap.yaml` L9-19).
- Give it its own ServiceAccount, Role and RoleBinding as ordinary chart resources.
- The Job reconciles; it does not "exit 0 if the Secret exists":
  1. GET the Secret `<release>-xcube-credential-keys` and the ConfigMap `<release>-xcube-public-key`.
  2. **Secret absent and ConfigMap absent:** run keygen into a memory-backed emptyDir and POST the Secret. A 409 means another pod won the race; GET the Secret and use its key.
  3. **Secret absent but ConfigMap present:** refuse with exit 1. A key existed here before, and a new one would orphan every stored credential (credential-sealing.md, Gotcha 16). The operator must restore the Secret.
  4. **Secret present:** derive the JWK from the Secret's PEM by running xcube's keygen on the existing PEM. `xcube-keygen <dir> <key.pem>` "the files for an existing X25519 key" and it prints the JWK (`/Users/srajagopal/Work/bi/cube/xcube/src/bin/keygen.ts` L7-9, L22-26).
  5. Ensure the ConfigMap. On 404, POST it; a 409 means re-GET it. If its `kid` differs from the Secret's, exit 1. The Job never updates anything.
- **Why reconcile instead of exiting when the Secret exists:** the Job can die between the two POSTs, and a Job's program "may sometimes be started twice" ([k8s-job]). Exit-if-exists would then leave the ConfigMap missing forever, and the API would never start.

## API surface we'll use

**In-cluster access with no client library** ([k8s-access-pod])
- Files:
  - token: `/var/run/secrets/kubernetes.io/serviceaccount/token`
  - CA bundle: `…/ca.crt`
  - namespace: `…/namespace`
- "Your container can create an HTTPS URL for the Kubernetes API server by fetching the `KUBERNETES_SERVICE_HOST` and `KUBERNETES_SERVICE_PORT_HTTPS` environment variables."
- The server is also reachable at `kubernetes.default.svc`, but "Kubernetes does not guarantee that the API server has a valid certificate for the hostname `kubernetes.default.svc`; however, the control plane **is** expected to present a valid certificate for the hostname or IP address that `$KUBERNETES_SERVICE_HOST` represents." **So use `KUBERNETES_SERVICE_HOST`.**
- kubeadm's apiserver certificate includes both the service ClusterIP and the `kubernetes.default.svc` names ([kubeadm-impl]).
- `enableServiceLinks: false` does not remove these variables. The kubelet always adds the `kubernetes` Service from the `default` namespace; only other Services need `enableServiceLinks` ([kubelet_pods.go L941-955][k8s-kubelet-pods-go]).

**What is mounted automatically, and the bound token**
- Automounted credentials are a projected volume with three sources ([k8s-sa-admin]):
  - `serviceAccountToken` (`expirationSeconds: 3607`)
  - `configMap kube-root-ca.crt` (`ca.crt`)
  - `downwardAPI` `metadata.namespace`
- Rotation: "The kubelet proactively requests rotation for the token if it is older than 80% of its total time-to-live (TTL), or if the token is older than 24 hours… The application is responsible for reloading the token when it rotates" ([k8s-sa-task]). Re-read the token file for each request.
- **The injected 3607-second token is extended.** When `--service-account-extend-token-expiration` is on (it is "Default: true"), "admission injected tokens would be extended up to 1 year" ([kube-apiserver flags][k8s-apiserver]). The code extends only when `ExpirationSeconds == WarnOnlyBoundTokenExpirationSeconds` (60*60+7) ([token.go L233-238][k8s-token-go]; [claims.go L31-34][k8s-claims-go]).
- For a self-declared projected token, `expirationSeconds` "defaults to 1 hour and must be at least 10 minutes (600 seconds)" ([k8s-projected]).
- Credentials are "revoked 60 seconds beyond the `.metadata.deletionTimestamp`" of the Pod ([k8s-sa-task]).

**`automountServiceAccountToken`**
- It can be set on the ServiceAccount and on the Pod. "If both … specify a value …, the Pod spec takes precedence" ([k8s-sa-task]).
- `serviceAccountName` can't be updated on an existing Pod ([k8s-sa-task]).

**REST calls**

| Call | Success | Other statuses |
|---|---|---|
| `GET /api/v1/namespaces/{ns}/secrets/{name}` ([k8s-secret-api]) | 200 | 404 `NotFound`: "the requested resource does not exist" ([k8s-api-conv]) |
| `GET /api/v1/namespaces/{ns}/configmaps/{name}` | 200 | 404 |
| `POST /api/v1/namespaces/{ns}/secrets` | The reference lists 200, 201, 202 ([k8s-secret-api]); 201 means "the request to create kind completed successfully" ([k8s-api-conv]) | 409: "either the resource the client attempted to create already exists or…", with reason `AlreadyExists` ([k8s-api-conv]); 422: invalid data ([k8s-api-conv]) |
| `POST /api/v1/namespaces/{ns}/configmaps` ([k8s-cm-api]) | 200/201/202 | same |
| any | | 401: authentication failed. 403: "If all of the modules deny the request… (HTTP status code 403)" ([k8s-ctrl-access]) |

- Error bodies are `kind: Status` with `reason` and `code` ([k8s-api-conv]).
- Authorization happens before admission ([k8s-ctrl-access]). An unauthorized GET of a missing Secret therefore answers 403, not 404. This is an inference from the stage order.

**Request bodies**
- Secret: `data` values are "a base64 encoded string" (RFC 4648 §4). `stringData` is a "write-only input field", merged into `data` on write and "never output when reading" ([k8s-secret-api]).
- `immutable: true` "ensures that data stored in the Secret cannot be updated (only object metadata can be modified)" ([k8s-secret-api]). The ConfigMap has the same field ([k8s-cm-api]).

```json
{"apiVersion":"v1","kind":"Secret","metadata":{"name":"<release>-xcube-credential-keys"},
 "type":"Opaque","immutable":true,"data":{"<kid>.pem":"<base64>","<kid>.check":"<base64>"}}
{"apiVersion":"v1","kind":"ConfigMap","metadata":{"name":"<release>-xcube-public-key"},
 "immutable":true,"data":{"jwk":"{\"kty\":\"OKP\",\"crv\":\"X25519\",\"x\":\"…\",\"kid\":\"…\"}","kid":"<kid>"}}
```

**keygen**
- In the image, run `node /cube/node_modules/xcube/dist/src/bin/keygen.js <dir> [<existing.pem>]`. xcube's CI runs it this way as `--user 1000` (`/Users/srajagopal/Work/bi/cube/xcube/test/image/serving.sh` L65-66).
- It writes `<kid>.pem` with mode 0600 and `<kid>.check`, prints the JWK on stdout, and writes a note on stderr (keygen.ts L23-27).
- `kid` is the base64url SHA-256 thumbprint (`/Users/srajagopal/Work/bi/cube/xcube/src/credentials/credentials.ts` L69-71, L207-208).
- `execFileSync` returns the stdout, and throws when the child exits non-zero ([node-cp]).

## RBAC

- **Verbs:**
  - POST maps to `create`.
  - GET/HEAD map to `get` (individual), `list` (collections) or `watch` ([k8s-authz]).
  - The Job needs only `get` and `create`. It never needs list, watch, update, patch or delete.
- **`resourceNames`:**
  - "You cannot restrict **deletecollection** or top-level **create** requests by resource name. For **create**, this limitation is because the name of the new object may not be known at authorization time" ([k8s-rbac]).
  - `get` can be restricted; the docs' example is `resourceNames: ["my-config"]`, `verbs: ["get"]` ([k8s-rbac]).
  - Restricted `list`/`watch` would need a `metadata.name` field selector ([k8s-rbac]). We don't list.

```yaml
apiVersion: v1
kind: ServiceAccount
metadata: { name: {{ $name }} }
automountServiceAccountToken: false          # the pod mounts its own short-lived token (Security)
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata: { name: {{ $name }} }
rules:
  - { apiGroups: [""], resources: [secrets],    resourceNames: [{{ $secret }}],    verbs: [get] }
  - { apiGroups: [""], resources: [configmaps], resourceNames: [{{ $configMap }}], verbs: [get] }
  - { apiGroups: [""], resources: [secrets, configmaps], verbs: [create] }   # can't be name-restricted
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata: { name: {{ $name }} }
roleRef: { apiGroup: rbac.authorization.k8s.io, kind: Role, name: {{ $name }} }
subjects: [{ kind: ServiceAccount, name: {{ $name }}, namespace: {{ .Release.Namespace }} }]
```

## Node HTTPS with the cluster CA

**Recommendation: `node:https` `request({ ca })`.**
- `https.request` accepts `tls.connect()` options including `ca` and `servername` ([node-https]).
- If `ca` is given, "the default list would be completely replaced (instead of being concatenated)" ([node-tls]). The Job then trusts only the cluster CA.

**Why not global `fetch`**
- The docs give `fetch` no CA option. It "is based upon undici", and a custom dispatcher must be undici-compatible. Changing the global dispatcher means "installing `undici`" ([node-fetch]), which is an extra library.
- An undici maintainer: "fetch() does not provide this as part of the spec" ([undici-1364]).
- `NODE_EXTRA_CA_CERTS=file`: "the well known 'root' CAs … will be extended with the extra certificates in `file`… neither the well known nor extra certificates are used when the `ca` options property is explicitly specified" ([node-cli]).
- `tls.getCACertificates('default')` includes NODE_EXTRA_CA_CERTS certificates ([node-tls]).
- Whether bundled-undici `fetch` honours it is not stated in Node's docs, and an open undici issue reports it failing ([undici-2200]). See Open questions.

**Version specifics**
- `tls.setDefaultCACertificates(certs)` was added in v24.5.0 and v22.19.0. It affects "subsequent TLS connections that don't specify their own CA certificates" ([node-tls]; [node22-tls]). Whether `fetch` picks it up is UNVERIFIED.
- `tls.getCACertificates` was added in v23.10.0 and v22.15.0 ([node-tls]).
- `fetch` has been stable since v21.0.0 ([node-fetch]).
- `.mjs` files run as ES modules ([node-esm]).

Illustrative sketch, not executed:

```js
// /job/keys.mjs — node: built-ins only
import https from 'node:https';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const SA = '/var/run/secrets/wechart/sa';                      // explicit projected volume
const KEYGEN = '/cube/node_modules/xcube/dist/src/bin/keygen.js';
const { SECRET, CONFIGMAP, KUBERNETES_SERVICE_HOST: host, KUBERNETES_SERVICE_PORT_HTTPS: port } = process.env;
const ns = readFileSync(`${SA}/namespace`, 'utf8').trim(), ca = readFileSync(`${SA}/ca.crt`);
const fail = (m) => { console.error(m); process.exit(1); };
const api = (method, path, body) => new Promise((resolve, reject) => {
  const token = readFileSync(`${SA}/token`, 'utf8').trim();    // re-read: rotated by the kubelet
  const req = https.request({ host, port, method, path, ca, headers: { authorization: `Bearer ${token}`,
      accept: 'application/json', ...(body && { 'content-type': 'application/json' }) } }, (res) => {
    let s = ''; res.setEncoding('utf8'); res.on('data', (c) => (s += c));
    res.on('end', () => resolve({ status: res.statusCode, body: s ? JSON.parse(s) : null }));
  });
  req.on('error', reject); req.end(body && JSON.stringify(body));
});
const S = `/api/v1/namespaces/${ns}/secrets`, C = `/api/v1/namespaces/${ns}/configmaps`;
let sec = await api('GET', `${S}/${SECRET}`), cm = await api('GET', `${C}/${CONFIGMAP}`);
if (sec.status === 404) {
  if (cm.status === 200) fail(`${SECRET} is missing but ${CONFIGMAP} names key ${cm.body.data.kid}: restore the Secret`);
  const jwk = JSON.parse(execFileSync('node', [KEYGEN, '/work/new']));
  const data = Object.fromEntries(['pem', 'check'].map((e) =>
    [`${jwk.kid}.${e}`, readFileSync(`/work/new/${jwk.kid}.${e}`).toString('base64')]));   // base64, not base64url
  const r = await api('POST', S, { apiVersion: 'v1', kind: 'Secret', metadata: { name: SECRET }, type: 'Opaque', immutable: true, data });
  sec = r.status === 409 ? await api('GET', `${S}/${SECRET}`) : r;
}
if (sec.status !== 200 && sec.status !== 201) fail(`GET/POST ${SECRET}: ${sec.status} ${sec.body?.message}`);
const pems = Object.keys(sec.body.data).filter((k) => k.endsWith('.pem'));
if (pems.length !== 1) fail(`${SECRET} holds ${pems.length} keys`);
mkdirSync('/work/have', { recursive: true });
writeFileSync('/work/have/key.pem', Buffer.from(sec.body.data[pems[0]], 'base64'), { mode: 0o600 });
const jwk = JSON.parse(execFileSync('node', [KEYGEN, '/work/out', '/work/have/key.pem']));
if (cm.status === 404) {
  const r = await api('POST', C, { apiVersion: 'v1', kind: 'ConfigMap', metadata: { name: CONFIGMAP }, immutable: true,
    data: { jwk: JSON.stringify(jwk), kid: jwk.kid } });
  cm = r.status === 409 ? await api('GET', `${C}/${CONFIGMAP}`) : r;
}
if (cm.body?.data?.kid !== jwk.kid) fail(`${CONFIGMAP} (${cm.status}) names ${cm.body?.data?.kid}, the Secret holds ${jwk.kid}`);
```

## Helm integration

**Plain Job vs hooks**

| | Plain Job, hash-named (recommended) | `post-install` hook | `pre-install` hook |
|---|---|---|---|
| Ordering | Created in the same `KubeClient.Create` as everything else. InstallOrder puts ServiceAccount, Secret and ConfigMap first, then Role and RoleBinding, then Deployment and StatefulSet, then Job ([kind_sorter][helm-kindsorter]; [install.go L447-451][helm-install]) | "if the `--wait` flag is set, the library will wait until all resources are in a ready state and will not run the `post-install` hook until they are ready" ([helm-hooks]; [install.go L454-468][helm-install]). **Cube Deployments need the Secret, so `--wait` deadlocks until `--timeout`** | Runs "before any resources are created" ([helm-hooks]), so its SA, Role and RoleBinding must be hooks too |
| `--wait` | Jobs are checked only with `--wait-for-jobs` ([ready.go L95-105][helm-ready]). Cube Deployments aren't Ready until the Secret exists, so a successful `--wait` implies the Job ran (inference) | deadlock | "If the resource is a `Job` or `Pod` kind, Helm will wait until it successfully runs to completion" ([helm-hooks]) |
| Tracking | In the manifest. `helm uninstall` deletes the Job and RBAC ([uninstall.go L156-176][helm-uninstall]) | "The resources that a hook creates are currently not tracked or managed as part of the release" ([helm-hooks]) | same; the default policy is `before-hook-creation` ([helm-hooks]) |
| `helm template`/`lint` | Deterministic: no `lookup` or `rand*` (compare `helm.md` Gotcha 2) | Hooks are printed unless `DisableHooks` is set ([template.go L100-122][helm-template]) | same |

**Upgrades**
- A changed pod template gives a new Job name.
- On upgrade, Helm deletes resources in the old manifest but not the new, so the old Job goes ([client.go L425-446][helm-client]).
- A Job deleted out-of-band (for example by `ttlSecondsAfterFinished`) is recreated on the next upgrade: "Since the resource does not exist, create it" ([client.go L378-391][helm-client]). The rerun is harmless.

**Uninstall and reinstall**
- The Secret and ConfigMap the Job POSTs are not in the release manifest, so `helm uninstall` leaves them ([helm-uninstall]).
- They have no `ownerReferences`, so garbage collection doesn't touch them when the Job goes ([k8s-gc]). This is an inference.
- A reinstall reuses the key, which is what the retained metadata database needs. To remove them, delete them with kubectl.
- **Don't later template a Secret or ConfigMap with those names in the chart.** Helm refuses to adopt objects without its ownership metadata (`helm.md`, "What happens on reinstall").

**Pod template sketch** (illustrative):

```yaml
spec:
  backoffLimit: 10
  template:
    spec:
      serviceAccountName: {{ $name }}
      automountServiceAccountToken: false
      enableServiceLinks: false
      restartPolicy: OnFailure
      securityContext: { runAsNonRoot: true, runAsUser: 1000, runAsGroup: 1000, seccompProfile: { type: RuntimeDefault } }
      containers:
        - name: keys
          image: {{ .Values.cube.image }}
          command: [node, /job/keys.mjs]
          env: [{ name: SECRET, value: {{ $secret | quote }} }, { name: CONFIGMAP, value: {{ $configMap | quote }} }]
          securityContext: { allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, capabilities: { drop: [ALL] } }
          volumeMounts:
            - { name: sa, mountPath: /var/run/secrets/wechart/sa, readOnly: true }
            - { name: work, mountPath: /work }
            - { name: script, mountPath: /job, readOnly: true }
      volumes:
        - name: sa
          projected:
            sources:
              - serviceAccountToken: { path: token, expirationSeconds: 600 }
              - configMap: { name: kube-root-ca.crt, items: [{ key: ca.crt, path: ca.crt }] }
              - downwardAPI: { items: [{ path: namespace, fieldRef: { fieldPath: metadata.namespace } }] }
        - { name: work, emptyDir: { medium: Memory } }
        - { name: script, configMap: { name: {{ $scriptConfigMap }} } }
```

- The Job's name must be "no longer than 63 characters" ([k8s-job]).
- `backoffLimit` defaults to 6 ([k8s-job]).

## Pod behavior while the Secret is missing

**Cube pods (Secret volume, not optional)**
1. The secret volume plugin returns the error unless the volume is optional and the error is NotFound ([secret.go L166-178][k8s-secret-vol-go]).
2. The failure is recorded as a `FailedMount` event with "MountVolume.SetUp failed" ([operation_generator.go L702-707, L759-762][k8s-opgen]; [event.go L33][k8s-events]).
3. Mount retries back off from 500 ms, doubling, up to 2m2s ([exponential_backoff.go][k8s-backoff]).
4. After 2m3s (`podAttachAndMountTimeout`), SyncPod records `FailedMount` "Unable to attach or mount volumes: unmounted volumes=[…]…" and skips the pod. The kubelet "will retry in the next sync iteration" ([volume_manager.go L38-51, L332-336][k8s-volmgr]; [kubelet.go ~L3540][k8s-kubelet]).
5. The docs agree: "the kubelet periodically retries running that Pod. The kubelet also reports an Event" ([k8s-secret]). The pod starts once the Secret exists.
6. No container starts before the mount, init containers included. The waiting reason is `ContainerCreating`, or `PodInitializing` for pods with init containers ([kubelet_pods.go L2338-2345][k8s-kubelet-pods-go]). Cube pods have the `wait-for-xcube-schema` init container (`cube.yaml` L68-69), so expect `PodInitializing`.
7. **Don't set `optional: true`.** An absent optional Secret is ignored ([k8s-secret]). xcube with `XCUBE_CREDENTIAL_KEY_IDS` set then refuses to start on the missing file, and without it runs keyless (`docs/research/xcube-slice-6.md`, Gotcha 7).

**API pod (JWK from `env.valueFrom.configMapKeyRef`)**
- "If you reference a ConfigMap that doesn't exist and you don't mark the reference as `optional`, the Pod won't start." Missing keys likewise ([k8s-cm-task]).
- The kubelet returns the GetConfigMap error, or "couldn't find key %v in ConfigMap %v/%v" ([kubelet_pods.go L1057-1077][k8s-kubelet-pods-go]).
- `startContainer` records a `Failed` event ("Error: …") and returns `CreateContainerConfigError` ([kuberuntime_container.go L58-66, L377-381][k8s-kuberuntime]). That reason becomes the container's Waiting reason ([kubelet_pods.go L2402-2425][k8s-kubelet-pods-go]), and the container is retried on later syncs.
- With `optional: true`, "the configuration … will be empty" ([k8s-cm-task]); the code skips the variable (`continue`). Don't use it: AC-324 needs the refusal.

## Security

**Pod security (restricted profile)**
- Restricted requires ([k8s-pss]):
  - `allowPrivilegeEscalation: false`
  - `runAsNonRoot: true`
  - `runAsUser` not 0
  - seccomp `RuntimeDefault` or `Localhost`
  - `drop: [ALL]`
  - volumes limited to types including `configMap`, `emptyDir`, `projected` and `secret`
- The sketch above complies.

**The image runs as root by default**
- xcube's image is `FROM cubejs/cube:${CUBE_VERSION}` with no `USER` (`/Users/srajagopal/Work/bi/cube/xcube/Dockerfile` L28-37).
- Cube's final stage is `node:24.21.0-trixie-slim` with no `USER` (`latest.Dockerfile` L26-60).
- Node images provide "a `node` user with uid 1000" ([docker-node-bp]).
- The chart already runs Cube as 1000 with an emptyDir (`cube.yaml` L54-61, L177-178).
- `runAsNonRoot` "will validate the image at runtime to ensure that it does not run as UID 0" ([k8s-pod-api]).
- keygen writes only into its directory argument (keygen.ts L23-25), so `readOnlyRootFilesystem` fits.

**Token**
- Mount a 600-second projected token with the ServiceAccount's automount off, instead of the injected 3607-second token that is extended to 1 year while the Pod exists ([k8s-apiserver]; [k8s-token-go]).
- Other wechart pods already set `automountServiceAccountToken: false` (chart templates). RBAC good practice says the same ([k8s-rbac-gp]).

**Residual `create` scope**
- The ServiceAccount can create *any* Secret or ConfigMap in the namespace ([k8s-rbac]).
- A controller fills a `token` into a created `kubernetes.io/service-account-token` Secret ([k8s-secret]). With code execution in the Job, that could mint a non-expiring token for another namespace ServiceAccount, readable only under the Secret name it may `get`.
- The bound: wechart's other pods use no RoleBindings.
- A ValidatingAdmissionPolicy (stable in v1.30; it needs a policy and a binding, [k8s-vap]) could pin names and type. It is cluster-scoped: UNVERIFIED.

**Secret exposure**
- Secrets are "stored unencrypted in the API server's underlying data store (etcd)" by default ([k8s-secret]).
- "anyone who is authorized to create a Pod in a namespace can use that access to read any Secret in that namespace" ([k8s-secret]).
- The Job's `get` on its own Secret adds nothing beyond that.

**Keep the PEM off disk**
- Use `emptyDir.medium: Memory` (tmpfs; "files you write count against the memory limit") ([k8s-volumes]).
- Secret volumes are "backed by tmpfs … never written to non-volatile storage" ([k8s-volumes]).

## Gotchas

1. **Secret `data` needs standard base64, not base64url.** The API requires RFC 4648 §4 ([k8s-secret-api]); Node's `'base64url'` is §5 and unpadded ([node-buffer]).
2. **Key names.**
   - Keys must match `[-._a-zA-Z0-9]+`, be at most 253 characters, and not be `.` or `..` or start with `..` ([validation.go L165, L357-372, L419-429][k8s-validation]; [k8s-secret]; [k8s-cm]).
   - The kid is base64url, whose alphabet is letters, digits, `-` and `_` ([rfc4648]; [node-buffer]).
   - So `<kid>.pem` and `<kid>.check` are valid even when the kid starts with `-` or `_`.
3. **Size limits.** "Individual Secrets are limited to 1MiB" ([k8s-secret]); "The data stored in a ConfigMap cannot exceed 1 MiB" ([k8s-cm]).
4. **`immutable: true` is one-way.** "You can only delete and recreate the Secret" ([k8s-secret]). Rotation is a separate design (Open questions).
5. **Secret volume file mode.** It defaults to 0644 ("Defaults to 0644"), not keygen's 0600. "This might be in conflict with … fsGroup" ([types.go SecretVolumeSource][k8s-types]). Cube runs as uid 1000, so a tighter `defaultMode` needs an `fsGroup` too.
6. **Hash-named Job versus `ttlSecondsAfterFinished`.** TTL deletion followed by an upgrade recreates and reruns the Job ([helm-client]). The rerun is harmless; the 600-second token makes TTL unnecessary for token hygiene.
7. **403 right after install.** The RoleBinding is created in the same batch just before the Job ([helm-kindsorter]). Whether the authorizer can lag is UNVERIFIED. Exit non-zero on 403 and let `backoffLimit` retry.
8. **`resourceNames` covers `get` only.** Never `list` the Secret: "`list` and `watch` access also effectively allow for users to reveal the Secret contents" ([k8s-rbac-gp]).
9. **Docker Desktop RBAC.** Older Docker Desktop shipped `docker-for-desktop-binding`, which made RBAC not enforced ([dd-4774]). Current behaviour is UNVERIFIED. Check with `kubectl auth can-i create secrets --as=system:serviceaccount:wechart:default -n wechart` (expect `no`). Otherwise an RBAC-denial test passes vacuously.

## Open questions / unverified

- **UNVERIFIED: does global `fetch` in Node 24.21.0 honour `NODE_EXTRA_CA_CERTS` or `tls.setDefaultCACertificates`?** Node's `fetch` docs are silent, and [undici-2200] is open. The recommendation avoids it.
- **UNVERIFIED: docker-desktop's apiserver certificate includes the ClusterIP SAN.** kubeadm does include it ([kubeadm-impl]), but the provisioner is unverified (`helm.md`). The Job succeeding is the test.
- **UNVERIFIED: whether Docker Desktop overrides `--service-account-extend-token-expiration`.** It is moot with the explicit 600-second token.
- **UNVERIFIED: exact event and message texts** beyond the sourced prefixes, and kubectl's STATUS column wording (for example `Init:0/1`).
- **UNVERIFIED: the published `cubejs/cube:v1.7.45` base.** I read the fork's working-tree Dockerfile only. Check with `docker run --rm --entrypoint node <image> -v`.
- **For the user: rotation.** Which kid the ConfigMap names when the Secret holds more than one `.pem`. The sketch refuses anything but exactly one.
- **For the user: how Cube pods learn the kid.** `XCUBE_CREDENTIAL_KEY_IDS` and `_ACTIVE_KID` could come from the ConfigMap `kid` (same CreateContainerConfigError behaviour) or from the mounted file names.

[k8s-access-pod]: https://kubernetes.io/docs/tasks/run-application/access-api-from-pod/
[k8s-sa-task]: https://kubernetes.io/docs/tasks/configure-pod-container/configure-service-account/
[k8s-sa-admin]: https://kubernetes.io/docs/reference/access-authn-authz/service-accounts-admin/
[k8s-projected]: https://kubernetes.io/docs/concepts/storage/projected-volumes/
[k8s-apiserver]: https://kubernetes.io/docs/reference/command-line-tools-reference/kube-apiserver/
[k8s-token-go]: https://github.com/kubernetes/kubernetes/blob/v1.34.1/pkg/registry/core/serviceaccount/storage/token.go
[k8s-claims-go]: https://github.com/kubernetes/kubernetes/blob/v1.34.1/pkg/serviceaccount/claims.go
[k8s-authz]: https://kubernetes.io/docs/reference/access-authn-authz/authorization/#request-verb-resource
[k8s-rbac]: https://kubernetes.io/docs/reference/access-authn-authz/rbac/#referring-to-resources
[k8s-rbac-gp]: https://kubernetes.io/docs/concepts/security/rbac-good-practices/
[k8s-api-conv]: https://github.com/kubernetes/community/blob/master/contributors/devel/sig-architecture/api-conventions.md#http-status-codes
[k8s-ctrl-access]: https://kubernetes.io/docs/concepts/security/controlling-access/
[k8s-secret-api]: https://kubernetes.io/docs/reference/kubernetes-api/config-and-storage-resources/secret-v1/
[k8s-cm-api]: https://kubernetes.io/docs/reference/kubernetes-api/config-and-storage-resources/config-map-v1/
[k8s-secret]: https://kubernetes.io/docs/concepts/configuration/secret/
[k8s-cm]: https://kubernetes.io/docs/concepts/configuration/configmap/
[k8s-cm-task]: https://kubernetes.io/docs/tasks/configure-pod-container/configure-pod-configmap/
[k8s-validation]: https://github.com/kubernetes/kubernetes/blob/v1.34.1/staging/src/k8s.io/apimachinery/pkg/util/validation/validation.go
[k8s-types]: https://github.com/kubernetes/kubernetes/blob/v1.34.1/staging/src/k8s.io/api/core/v1/types.go
[k8s-secret-vol-go]: https://github.com/kubernetes/kubernetes/blob/v1.34.1/pkg/volume/secret/secret.go
[k8s-opgen]: https://github.com/kubernetes/kubernetes/blob/v1.34.1/pkg/volume/util/operationexecutor/operation_generator.go
[k8s-events]: https://github.com/kubernetes/kubernetes/blob/v1.34.1/pkg/kubelet/events/event.go
[k8s-kubelet]: https://github.com/kubernetes/kubernetes/blob/v1.34.1/pkg/kubelet/kubelet.go
[k8s-volmgr]: https://github.com/kubernetes/kubernetes/blob/v1.34.1/pkg/kubelet/volumemanager/volume_manager.go
[k8s-backoff]: https://github.com/kubernetes/kubernetes/blob/v1.34.1/pkg/util/goroutinemap/exponentialbackoff/exponential_backoff.go
[k8s-kubelet-pods-go]: https://github.com/kubernetes/kubernetes/blob/v1.34.1/pkg/kubelet/kubelet_pods.go
[k8s-kuberuntime]: https://github.com/kubernetes/kubernetes/blob/v1.34.1/pkg/kubelet/kuberuntime/kuberuntime_container.go
[k8s-job]: https://kubernetes.io/docs/concepts/workloads/controllers/job/
[k8s-gc]: https://kubernetes.io/docs/concepts/architecture/garbage-collection/
[k8s-pss]: https://kubernetes.io/docs/concepts/security/pod-security-standards/
[k8s-pod-api]: https://kubernetes.io/docs/reference/kubernetes-api/workload-resources/pod-v1/
[k8s-volumes]: https://kubernetes.io/docs/concepts/storage/volumes/
[k8s-vap]: https://kubernetes.io/docs/reference/access-authn-authz/validating-admission-policy/
[kubeadm-impl]: https://kubernetes.io/docs/reference/setup-tools/kubeadm/implementation-details/
[helm-hooks]: https://helm.sh/docs/v3/topics/charts_hooks/
[helm-install]: https://github.com/helm/helm/blob/v3.17.2/pkg/action/install.go
[helm-uninstall]: https://github.com/helm/helm/blob/v3.17.2/pkg/action/uninstall.go
[helm-client]: https://github.com/helm/helm/blob/v3.17.2/pkg/kube/client.go
[helm-ready]: https://github.com/helm/helm/blob/v3.17.2/pkg/kube/ready.go
[helm-kindsorter]: https://github.com/helm/helm/blob/v3.17.2/pkg/releaseutil/kind_sorter.go
[helm-template]: https://github.com/helm/helm/blob/v3.17.2/cmd/helm/template.go
[node-https]: https://nodejs.org/docs/latest-v24.x/api/https.html#httpsrequestoptions-callback
[node-tls]: https://nodejs.org/docs/latest-v24.x/api/tls.html#tlscreatesecurecontextoptions
[node22-tls]: https://nodejs.org/docs/latest-v22.x/api/tls.html#tlssetdefaultcacertificatescerts
[node-cli]: https://nodejs.org/docs/latest-v24.x/api/cli.html#node_extra_ca_certsfile
[node-fetch]: https://nodejs.org/docs/latest-v24.x/api/globals.html#fetch
[node-buffer]: https://nodejs.org/docs/latest-v24.x/api/buffer.html#buffers-and-character-encodings
[node-cp]: https://nodejs.org/docs/latest-v24.x/api/child_process.html#child_processexecfilesyncfile-args-options
[node-esm]: https://nodejs.org/docs/latest-v24.x/api/esm.html#enabling
[undici-1364]: https://github.com/nodejs/undici/discussions/1364
[undici-2200]: https://github.com/nodejs/undici/issues/2200
[rfc4648]: https://www.rfc-editor.org/rfc/rfc4648#section-5
[docker-node-bp]: https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md#non-root-user
[dd-4774]: https://github.com/docker/for-mac/issues/4774
