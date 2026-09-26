---
library: Helm
packages: []
version: 3.17.2
researched: 2026-09-25
sources:
  - https://github.com/helm/helm/tree/v3.17.2
  - https://github.com/helm/helm/releases/tag/v3.17.2
  - https://helm.sh/docs/v3/topics/charts/
  - https://helm.sh/docs/v3/chart_template_guide/functions_and_pipelines/
  - https://helm.sh/docs/v3/chart_template_guide/function_list/
  - https://helm.sh/docs/v3/chart_template_guide/named_templates/
  - https://helm.sh/docs/v3/chart_template_guide/accessing_files/
  - https://helm.sh/docs/v3/howto/charts_tips_and_tricks/
  - https://helm.sh/docs/v3/chart_best_practices/labels/
  - https://helm.sh/docs/v3/chart_best_practices/values/
  - https://helm.sh/docs/v3/helm/helm_upgrade/
  - https://helm.sh/docs/v3/helm/helm_uninstall/
  - https://helm.sh/docs/v3/topics/version_skew/
  - https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/
  - https://kubernetes.io/docs/reference/kubernetes-api/workload-resources/stateful-set-v1/
  - https://kubernetes.io/docs/concepts/workloads/controllers/deployment/
  - https://kubernetes.io/docs/concepts/workloads/pods/probes/
  - https://kubernetes.io/docs/tasks/configure-pod-container/security-context/
  - https://kubernetes.io/docs/concepts/security/pod-security-standards/
  - https://kubernetes.io/docs/concepts/storage/volumes/
  - https://kubernetes.io/docs/concepts/configuration/secret/
  - https://kubernetes.io/docs/concepts/containers/images/
  - https://kubernetes.io/docs/concepts/services-networking/service/
  - https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/
  - https://docs.docker.com/desktop/use-desktop/kubernetes/
  - https://docs.docker.com/desktop/release-notes/
kubernetes_api_versions: [apps/v1 (Deployment, StatefulSet), v1 (Service, ConfigMap, Secret, PersistentVolumeClaim, Namespace)]
chart_api_version: v2
---
# Helm 3.17.2 (chart authoring and install on Docker Desktop Kubernetes v1.34.1)

> **Stale in one place, 2026-09-25** (architecture decisions 11 and 12, [docs/inputs/2026-09-25-architecture-decisions.md](../inputs/2026-09-25-architecture-decisions.md)): the generated `cube-api-secret` (:219) gives way to an RS256 key pair, keys pushed to xcube, and a service credential. The chart also grows to 2+ Cube instances and 2+ API replicas (see `cube/ha-topology.md`).

## Summary

Helm is the Kubernetes package manager. Charts with `apiVersion: v2` are Helm 3 charts ([helm-charts]). wechart uses it for **F24 / AC-248**: one chart at `deploy/helm/wechart` must run the web app (nginx serving the SPA), the Node API, the metadata Postgres, the Cube API, the Cube refresh worker and Cube Store. It must take Cube's data source from values, and it must serve the web app at the address the values name. The chart is installed with:

`helm upgrade --install wechart deploy/helm/wechart -n wechart --create-namespace --wait --kube-context docker-desktop`

The AC's "Fails when" is checked this way:
- **"A component is not Ready":** `--wait` checks readiness. Section 3 says exactly what it checks in 3.17.2.
- **"The web app's address does not load":** this depends on how Docker Desktop publishes a `LoadBalancer` Service. Section 5 covers it, and it is partly UNVERIFIED.
- **"A query does not reach the data source":** Cube's environment is templated from values. The Cube-specific variables are in the sibling doc `./cube/configuration-deployment.md`.

Pinned version: v3.17.2 was released 2025-03-13. It is a patch release that only bumps x/net and the k8s-io dependencies ([helm-rel-3172]). Features added in 3.17.0 include `--take-ownership` and `toYamlPretty` ([helm-rel-3170]).

Component-specific facts are in sibling docs and are not repeated here:
- Postgres in a StatefulSet (PGDATA, uid 70, `fsGroup` and hostPath): `./postgres-image.md`.
- Cube's `/readyz` and `/livez` endpoints and the Cube Store ports: `./cube/configuration-deployment.md` and `./cube/refresh-jobs-caching.md`.

## Install

- Nothing is installed into the codebase. The Helm CLI 3.17.2 is already on the host. `packages: []`.
- **Version skew (important):** "Helm 3.17.x: 1.32.x - 1.29.x", and "It is not recommended to use Helm with a version of Kubernetes that is newer than the version it was compiled against, as Helm does not make any forward compatibility guarantees" ([helm-skew]).
  - The cluster runs v1.34.1, which is outside 3.17's supported range.
  - Only 3.19.x ("1.34.x - 1.31.x") through 3.22.x list 1.34 ([helm-skew]).
  - Everything this chart uses (apps/v1, v1) is long-stable, so no concrete breakage was found. The skew is still a documented risk. See Open questions.
- **Helm 3 lifecycle:** bug fixes ended with the final feature release on 2026-09-09. "Security fixes end February 10th, 2027" ([helm-eol]).
- **Kube context:** Docker Desktop's context is `docker-desktop` (`kubectl config use-context docker-desktop`) ([dd-k8s]). `--kube-context` is Helm's global flag for choosing a kubeconfig context ([helm-upgrade-cmd]).

## Init / auth pattern

Helm uses the kubeconfig context; there is no other auth step. Minimal chart layout for apiVersion v2 ([helm-charts], [helm-src-create]):

```
deploy/helm/wechart/
  Chart.yaml          # required
  values.yaml         # default values
  values.schema.json  # optional; validates the merged .Values
  .helmignore
  templates/
    _helpers.tpl      # partials; files starting with "_" are not rendered as manifests
    NOTES.txt         # printed after install; not a manifest
    *.yaml
```

**Chart.yaml**
- Required fields: `apiVersion` ("The chart API version (required)"), `name` (required) and `version` (required).
- Optional fields: `type` ("application" is the default; the only other value is "library") and `appVersion` ("Needn't be SemVer. Quotes recommended.") ([helm-charts]).
- 3.17.2 enforces these in `Metadata.Validate()`, with these errors:
  - `chart.metadata.apiVersion is required`
  - `chart.metadata.name is required`
  - the name must equal `filepath.Base(name)`
  - `chart.metadata.version is required`
  - version must be valid SemVer: `chart.metadata.version %q is invalid`
  - `chart.metadata.type must be application or library`

  Source: [helm-src-metadata].
- Quote `appVersion`: unquoted, YAML reads `1.0` as a float and a SHA like `1234e10` as scientific notation ([helm-charts]).

```yaml
apiVersion: v2
name: wechart
description: wechart BI (web, API, metadata DB, Cube API, refresh worker, Cube Store)
type: application
version: 0.1.0          # chart version, SemVer
appVersion: "0.1.0"     # app version, quoted
```

**`.helmignore`**
- Supported syntax: shell globs, trailing `/` for directories, `!` negation, and a leading `/` for root-relative patterns.
- `**` is rejected with "double-star (**) syntax is not supported".
- Helm always adds the default rule `templates/.?*`, which ignores dotfiles in `templates/` ([helm-src-ignore]).
- `helm create` writes a default ignore list (`.git/`, `.DS_Store`, `*.swp`, `*.bak`, `*.tmp`, `*.orig`, `*~`, `.idea/`, `.vscode/`, …) ([helm-src-create]).

**`_helpers.tpl` (the `helm create` defaults, 3.17.2)** ([helm-src-create]):
- `<chart>.name`: `default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-"`
- `<chart>.fullname`:
  - uses `fullnameOverride` if set;
  - otherwise uses `.Release.Name` alone if it already contains the chart name;
  - otherwise uses `printf "%s-%s" .Release.Name $name`.
  - The result is truncated to 63 characters "because some Kubernetes name fields are limited to this (by the DNS naming spec)".
  - Consequence for us: release `wechart` + chart `wechart` gives fullname `wechart`.
- `<chart>.chart`: `printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-"`
- `<chart>.labels`: `helm.sh/chart`, the selector labels, `app.kubernetes.io/version` (quoted AppVersion) and `app.kubernetes.io/managed-by: {{ .Release.Service }}`
- `<chart>.selectorLabels`: `app.kubernetes.io/name` and `app.kubernetes.io/instance: {{ .Release.Name }}`

**Recommended labels**
- Helm's best-practice table: REC for `app.kubernetes.io/name`, `helm.sh/chart`, `app.kubernetes.io/managed-by` and `app.kubernetes.io/instance`; OPT for `app.kubernetes.io/version`, `app.kubernetes.io/component` and `app.kubernetes.io/part-of` ([helm-labels]).
- Kubernetes: "These are recommended labels … aren't required for any core tooling" ([k8s-labels]).
- Template names are global, so prefix them with the chart name (`wechart.labels`) ([helm-named]).

**Multi-component selector (design consequence)**
- The `helm create` selector (name + instance) is identical for every workload in one chart.
- In apps/v1, "`.spec.selector` is immutable after creation of the Deployment" ([k8s-deploy]). StatefulSet selector changes are also forbidden ([k8s-apps-validation]).
- So add `app.kubernetes.io/component` to the selector from the first install. Illustrative, not executed:

```yaml
{{- define "wechart.selectorLabels" -}}
app.kubernetes.io/name: {{ include "wechart.name" .ctx }}
app.kubernetes.io/instance: {{ .ctx.Release.Name }}
app.kubernetes.io/component: {{ .component }}
{{- end }}
{{/* usage: {{- include "wechart.selectorLabels" (dict "ctx" . "component" "api") | nindent 6 }} */}}
```

- `include` takes a single data argument (`func(name string, data interface{})`), which is why the call passes a `dict` ([helm-src-engine]).
- Sprig `dict` builds a map from pairs ([sprig-dicts]).

## API surface we will use

### 1. Template functions

**`lookup apiVersion kind namespace name`**
- Returns a "resource or resource list" ([helm-lookup]).
- For a namespaced resource, both `namespace` and `name` must be given. With `name` empty it lists, and the result has `.items` ([helm-lookup]).
- "When no object is found, an empty value is returned." In 3.17.2 the code catches NotFound and returns an empty `map[string]interface{}`, "That way, users can use `if not (lookup ...)`" ([helm-src-lookup]).
- Any other API error, such as RBAC, fails rendering ([helm-lookup]).
- **Without cluster access it returns an empty map:**
  - The default `lookup` in the func map is a placeholder that returns `map[string]interface{}{}, nil` ([helm-src-funcs]).
  - The real one is installed only when `!e.LintMode && e.clientProvider != nil` ([helm-src-engine]).
  - `renderResources` builds a cluster-backed engine only when `interactWithRemote && cfg.RESTClientGetter != nil` ([helm-src-action]).
  - `interactWithRemote` is true when not a dry run, or when `DryRunOption` is `"server"`, `"none"` or `"false"` ([helm-src-install], [helm-src-upgrade]).
  - `helm template` sets `DryRunOption = "true"` only when the flag is empty, so `helm template --dry-run=server` keeps "server" ([helm-src-cmd-template]).
  - Summary table:

    | Command | What `lookup` does |
    |---|---|
    | `helm template` | empty |
    | `helm install/upgrade --dry-run` or `--dry-run=client` | empty |
    | `helm lint` (LintMode) | empty |
    | `--dry-run=server` | queries the cluster |
    | real install/upgrade | queries the cluster |

  - The docs say the same: "Helm is not supposed to contact the Kubernetes API Server during a `helm template|install|upgrade|delete|rollback --dry-run` operation. To test `lookup` against a running cluster, … `--dry-run=server` should be used" ([helm-lookup]).
- The `--dry-run` flag accepts `false|true|none|client|server`. A bare `--dry-run` means `client` ([helm-src-cmd-install]).

**Other functions**
- **`randAlphaNum n`:** `0-9a-zA-Z`, "cryptographically secure (uses `crypto/rand`)" ([sprig-strings]).
- **`b64enc` / `b64dec`:** Base64 encode and decode ([helm-funclist]).
- **`required "msg" v`:**
  - Fails rendering if `v` is nil or `""` ([helm-src-engine], [helm-tips]).
  - **In lint mode it only logs `[INFO] Missing required value` and continues.** `fail` also only logs in lint mode ([helm-src-engine]).
- **`default d v`:** empty means 0, `""`, `[]`, `{}`, `false` or nil ([helm-funclist]).
- **`toYaml`:** marshals and trims the trailing newline; on error it returns `""` ([helm-src-funcs]).
- **`nindent n`:** indents and prepends a newline ([helm-funclist]). The idiom is `{{- include "x" . | nindent 4 }}` ([helm-tips]).
- **`include name data`:** preferred over `template` because its output can be piped ([helm-named]).
- **`tpl TEMPLATE_STRING VALUES`:** evaluates a string as a template ([helm-tips]).
- **`quote`:** wraps in double quotes. Quote strings but not integers. Environment-variable values should be quoted even when numeric ([helm-tips]).
- **`sha256sum`:** SHA-256 digest of a string ([helm-funclist]).
- **`get $dict "k"`:** returns `""` for a missing key, with no error ([sprig-dicts]).
- **Removed from Sprig in Helm:** `env` and `expandenv` ([helm-src-funcs]).

**`.Files`** ([helm-files])
- `.Files.Get "path"`, `.Files.Glob`, `.AsConfig`, `.AsSecrets` and `.Lines` are available.
- Restrictions: "Files in `templates/` cannot be accessed", "Files excluded using `.helmignore` cannot be accessed", and files outside a (sub)chart cannot be accessed.
- "Charts must be smaller than 1M because of the storage limitations of Kubernetes objects."

**Symlinks in 3.17.2**
- A directory chart is loaded by `Loader`. `os.Stat` plus `IsDir` selects `DirLoader` ([helm-src-load]).
- `LoadDir` walks with `sympath.Walk` ([helm-src-loaddir]). `helm package` also uses `loader.LoadDir` and then `chartutil.Save` ([helm-src-package]).
- `symwalk` resolves each symlink with `filepath.EvalSymlinks` and descends into it, following both files and directories.
- For each symlink it calls `log.Printf("found symbolic link in path: %s resolves to %s. Contents of linked file included and used", …)`. The comment says symlinks "can be used for nefarious reasons" ([helm-src-sympath]).
- `cmd/helm` sets `log.SetFlags(log.Lshortfile)` ([helm-src-main]), so the warning appears with a file:line prefix. Go's default logger writes to stderr.
- Inference from the code: a symlink inside the chart dir that points outside it is followed. Its content is stored under the symlink's in-chart path, and `.Files.Get "<symlink path>"` would return it.
- A broken symlink fails with `error evaluating symlink %s` ([helm-src-sympath]).

**Pattern: generate-once Secret kept across upgrades.** Illustrative, not executed.

```yaml
{{- $name := printf "%s-secrets" (include "wechart.fullname" .) }}
{{- $existing := lookup "v1" "Secret" .Release.Namespace $name }}
{{- $data := dict }}
{{- if $existing }}{{- $data = $existing.data }}{{- end }}
apiVersion: v1
kind: Secret
metadata:
  name: {{ $name }}
  labels: {{- include "wechart.labels" . | nindent 4 }}
  annotations:
    helm.sh/resource-policy: keep
type: Opaque
data:
  postgres-password: {{ get $data "postgres-password" | default (randAlphaNum 32 | b64enc) | quote }}
  cube-api-secret:   {{ get $data "cube-api-secret"   | default (randAlphaNum 48 | b64enc) | quote }}
```

How it behaves:
- A Secret's `data` values are base64 strings ([k8s-secret]). The looked-up values can be reused as-is without `b64dec`/`b64enc`.
- On a real install or upgrade, `lookup` reads the live Secret. On `helm template`, `--dry-run`, and in lint it is empty, so new random values render each time (see Gotchas).

What `helm.sh/resource-policy: keep` does ([helm-tips]):
- It "instructs Helm to skip deleting this resource when a helm operation (such as `helm uninstall`, `helm upgrade` or `helm rollback`) would result in its deletion."
- "However, this resource becomes orphaned. Helm will no longer manage it in any way. This can lead to problems if using `helm install --replace`…"
- On uninstall Helm reports "These resources were kept due to the resource policy:" ([helm-src-uninstall]).

What happens on reinstall (inference from `validate.go`):
- The kept Secret still carries `app.kubernetes.io/managed-by=Helm`, `meta.helm.sh/release-name` and `meta.helm.sh/release-namespace`.
- A reinstall with the same release name and namespace passes the ownership check and adopts it. A different name or namespace fails with "… exists and cannot be imported into the current release: invalid ownership metadata" ([helm-src-validate]).

Why keep matters here:
- The Postgres PVC also survives uninstall (section 4).
- The postgres image applies `POSTGRES_PASSWORD` only when "you start the container with a data directory that is empty; any pre-existing database will be left untouched" ([pg-hub]).
- A regenerated password would not match the retained database.

**Pattern: roll pods when config changes** ([helm-tips]):

```yaml
spec:
  template:
    metadata:
      annotations:
        checksum/config: {{ include (print $.Template.BasePath "/configmap.yaml") . | sha256sum }}
```

- Also `rollme: {{ randAlphaNum 5 | quote }}` "so it always changes and causes the deployment to roll".
- A Deployment rolls out "if and only if the Deployment's Pod template (`.spec.template`) is changed" ([k8s-deploy]). That is why the annotation works.

**Values validation**
- `values.schema.json` is checked against "the final `.Values` object" on `helm install`, `upgrade`, `lint` and `template`. `--skip-schema-validation` disables it ([helm-charts]).
- Best practice: camelCase keys and quoted strings. Large integers may turn into scientific notation ([helm-values-bp]).
- Predefined objects: `.Release.Name`, `.Release.Namespace`, `.Release.IsInstall`, `.Release.IsUpgrade`, `.Release.Service`, `.Chart`, `.Files`, `.Capabilities` ([helm-charts]).

### 2. CLI behaviour (3.17.2)

**`helm upgrade --install`**
- Upgrade checks release history. If the release is not found, or its latest revision is `uninstalled`, it runs an install ([helm-src-cmd-upgrade]).
- The install copies `Wait`, `WaitForJobs`, `Timeout`, `Atomic`, `TakeOwnership`, the dry-run settings and more. `CreateNamespace` comes from the flag ([helm-src-cmd-upgrade]).
- On upgrade, if the last revision is pending it returns `errPending` = "another operation (install/upgrade/rollback) is in progress" ([helm-src-action], [helm-src-upgrade]).
- If there is no deployed revision and the last one is `failed` or `superseded`, the upgrade proceeds from it ([helm-src-upgrade]). A failed first install does not block the next `upgrade --install`.
- Ctrl-C or SIGTERM: prints "Release %s has been cancelled." and cancels the context ([helm-src-cmd-install]). The install then goes through `failRelease`, which records `failed` ([helm-src-install]).

**`--create-namespace`**
- Help text: "if --install is set, create the release namespace if not present" ([helm-upgrade-cmd]).
- The code builds a `v1 Namespace` labelled `name: <ns>` and creates it directly with the kube client. `AlreadyExists` is ignored ([helm-src-install]).
- The Namespace is not part of the release manifest (see Gotchas).
- Helm 3 otherwise "returns an error if the namespace does not exist" ([helm-changes]).

**`--wait`**
- Help text: "will wait until all Pods, PVCs, Services, and minimum number of Pods of a Deployment, StatefulSet, or ReplicaSet are in a ready state before marking the release as successful. It will wait for as long as --timeout" ([helm-upgrade-cmd]).
- Helm first creates every resource in one `KubeClient.Create` call (or `Update`), then calls `Wait(resources, Timeout)` ([helm-src-install]). **Helm does not wait for one kind before creating the next.**
- The kind sort order (Secret, ConfigMap, PVC, … Service, … Deployment, StatefulSet, Job …) only orders creation ([helm-src-kindsorter]).
- It polls every 2 s under `context.WithTimeout(timeout)` ([helm-src-wait]).
- Per kind, from `ready.go` ([helm-src-ready]):

| Kind | Ready when |
|---|---|
| Pod (in the manifest) | the Pod Ready condition is true |
| Deployment | not paused (paused → `pausedAsReady`); the new ReplicaSet exists; `observedGeneration == generation`; `rs.ReadyReplicas >= replicas - MaxUnavailable` |
| StatefulSet | `observedGeneration == generation`. **If `updateStrategy` is not RollingUpdate it is treated as ready immediately.** Otherwise `UpdatedReplicas >= replicas - partition`, `ReadyReplicas == replicas`, and when partition is 0, `currentRevision == updateRevision` |
| PVC (in the manifest) | `status.phase == Bound` |
| Service | ExternalName: always ready. Otherwise `spec.clusterIP` must not be empty (headless `None` passes). **LoadBalancer: ready if `spec.externalIPs` is set, else waits until `status.loadBalancer.ingress` is non-nil** |
| Job | checked only with `--wait-for-jobs` |
| DaemonSet, ReplicaSet, CRD | have their own checks |
| any other kind | "always considered ready" |

- Deployment default `maxUnavailable` is 25%, rounded down ([k8s-deploy]). With `replicas: 1` that gives 0, so one ready pod is required.

**Timeouts and failure handling**
- `--timeout` defaults to 5m0s: "time to wait for any individual Kubernetes operation (like Jobs for hooks)" ([helm-upgrade-cmd]).
- `--atomic`:
  - It sets `Wait = Wait || Atomic` ([helm-src-install], [helm-src-upgrade]).
  - On install failure it uninstalls with `KeepHistory=false` and returns "release %s failed, and has been uninstalled due to atomic being set" ([helm-src-install]).
  - On upgrade failure it rolls back to the last successful release. `--cleanup-on-fail` deletes new resources ([helm-src-upgrade], [helm-upgrade-cmd]).
- `--take-ownership` (new in 3.17.0) skips the Helm-annotation ownership check and adopts existing resources ([helm-src-cmd-install], [helm-rel-3170]).

**`helm lint`**
- "[ERROR]" marks problems that will make install fail; "[WARNING]" marks convention issues ([helm-src-cmd-lint]).
- Failure threshold: `ErrorSev` normally, or `WarningSev` with `--strict` ([helm-src-action-lint]).
- It prints "X chart(s) linted, Y chart(s) failed" and returns an error if any chart failed ([helm-src-cmd-lint]).
- The Templates rule renders in LintMode with release name `test-release` ([helm-src-lint-rules]). Its checks:
  - template file extensions must be `.yaml`, `.yml`, `.tpl` or `.txt`
  - rendered YAML must parse
  - metadata names must be DNS-1123
  - deprecated API versions produce warnings
  - Deployment, ReplicaSet, DaemonSet and StatefulSet must have `matchLabels`/`matchExpressions`
  - `helm.sh/resource-policy` inside List objects is ignored
- It honours `-f`/`--set` and `--kube-version` ([helm-src-cmd-lint]).

**`helm template`**
- "Render chart templates locally … Any values that would normally be looked up or retrieved in-cluster will be faked locally" ([helm-src-cmd-template]).
- Release name defaults to `release-name`. It sets `ClientOnly = !validate`, where `--validate` validates against the current cluster. Other flags: `--kube-version`, `--api-versions`, `--show-only/-s`, `--output-dir`, `--is-upgrade` ([helm-src-cmd-template]).
- A `required` failure does error here (it is not lint mode) ([helm-src-engine]).

**Exit codes:** any command error gives `os.Exit(1)`. Plugin errors use their own code ([helm-src-main]).

**`helm uninstall`**
- "removes all of the resources associated with the last release of the chart as well as the release history" ([helm-uninstall-cmd]).
- Flags: `--cascade` (background default), `--keep-history`, `--wait`, `--timeout` (5m), `--ignore-not-found` ([helm-uninstall-cmd]).
- It leaves behind:
  - `keep`-annotated resources ([helm-tips]);
  - PVCs created by StatefulSet `volumeClaimTemplates`, because they are created by the controller, not Helm, and are retained by default (section 4);
  - the namespace made by `--create-namespace` (see Gotchas).

### 3. Kubernetes objects (apps/v1, v1)

**StatefulSet (apps/v1)** — used for Postgres and Cube Store
- `selector` must match `template.metadata.labels`, or creation fails validation ([k8s-sts]).
- `serviceName` names "the service that governs this StatefulSet" and must exist ([k8s-sts-api]).
  - "StatefulSets currently require a Headless Service … **You are responsible for creating this Service**" ([k8s-sts]).
  - A headless Service sets `clusterIP: None` ([k8s-svc]).
- `volumeClaimTemplates`: "Each VolumeClaimTemplate entry provides one PersistentVolumeClaim per Pod" ([k8s-sts]). The PVCs are named like `www-web-0` ([k8s-sts-tutorial]).
- Defaults ([k8s-sts-api]):
  - `podManagementPolicy: OrderedReady`
  - `updateStrategy: RollingUpdate`
  - `replicas: 1`
  - `minReadySeconds: 0`
  - `revisionHistoryLimit: 10`
- Pod DNS: `$(podname).$(service).$(namespace).svc.cluster.local` ([k8s-sts]).
- **Volumes are not deleted:** "Deleting and/or scaling a StatefulSet down will *not* delete the volumes associated with the StatefulSet" ([k8s-sts]).
  - `.spec.persistentVolumeClaimRetentionPolicy` (`whenDeleted` / `whenScaled`, each `Retain` (default) or `Delete`) controls this ([k8s-sts]).
  - It is stable since 1.32 per the StatefulSetAutoDeletePVC gate ([k8s-sts-gate]), so it is available on v1.34.1.
- **Only some fields can change on update:** "updates to statefulset spec for fields other than 'replicas', 'ordinals', 'template', 'updateStrategy', 'revisionHistoryLimit', 'persistentVolumeClaimRetentionPolicy' and 'minReadySeconds' are forbidden" (v1.34.1) ([k8s-apps-validation]).
  - So `selector`, `serviceName` and `volumeClaimTemplates` (including storage size) are fixed after the first install.
  - Recovery is to delete with `--cascade=orphan` and reapply ([k8s-sts-delete]).
- With `OrderedReady` a broken rolling update can require "manual intervention to repair". Reverting the template alone isn't enough; you must delete the broken pods ([k8s-sts]).

**Deployment (apps/v1)** — used for web (nginx), API, Cube API and the refresh worker
- `.spec.selector` is immutable in apps/v1 ([k8s-deploy]).
- `progressDeadlineSeconds` defaults to 600 ([k8s-deploy]).

**Probes** ([k8s-probes])

| Field | Default | Minimum | Notes |
|---|---|---|---|
| `initialDelaySeconds` | 0 | 0 | |
| `periodSeconds` | 10 | 1 | |
| `timeoutSeconds` | 1 | 1 | |
| `successThreshold` | 1 | 1 | must be 1 for liveness and startup |
| `failureThreshold` | 3 | 1 | |

- `httpGet` fields: `path`, `port`, `scheme`, `host`, `httpHeaders`. Success is a status ">= 200 and less than 400" ([k8s-probes]).
- `tcpSocket` succeeds "if the port is open" ([k8s-probes]).
- `exec` succeeds on exit 0 ([k8s-probes]). The command "is simply exec'd, it is not run inside a shell" (quoted in `./postgres-image.md` from [k8s-pod-api]).
- Failure effects ([k8s-probes-concept]):
  - A failing readiness probe removes the Pod IP from EndpointSlices; the container is not restarted.
  - Failing liveness or startup probes restart the container.
  - "If a startup probe is configured, Kubernetes does not execute liveness or readiness probes until the startup probe succeeds."
- Size the startup probe so `failureThreshold * periodSeconds` covers the worst-case startup ([k8s-probes-task]).

**securityContext**
- `runAsNonRoot: true`: "the Kubelet will validate the image at runtime to ensure that it does not run as UID 0 … and fail to start the container if it does" ([k8s-pod-api]).
  - In v1.34.1 the kubelet errors with "container has runAsNonRoot and image has non-numeric user (%s), cannot verify user is non-root" when the image `USER` is a name and no `runAsUser` is set ([k8s-kubelet-nonroot]).
  - So set a numeric `runAsUser` for images whose USER is a name.
- `fsGroup`: supplementary group and volume ownership, which "only applies to volume types that support `fsGroup` controlled ownership" ([k8s-secctx]).
  - hostPath volumes do not get it: `Managed: false` and `SetUp` never calls `SetVolumeOwnership` (v1.34.1) ([k8s-hostpath-go]).
  - See `./postgres-image.md` for Postgres consequences.
- `readOnlyRootFilesystem`: "Mounts the container's root filesystem as read-only" ([k8s-secctx]). Every path a process writes must then be a mounted volume, such as emptyDir. This is an inference.
- `allowPrivilegeEscalation`: "If … not defined … it will default to true". Setting `false` is incompatible with privileged containers or `CAP_SYS_ADMIN` ([k8s-secctx]).
- PSS "restricted" requires ([k8s-pss]):
  - `allowPrivilegeEscalation: false`
  - `runAsNonRoot: true`
  - `runAsUser` not 0
  - `seccompProfile.type` of `RuntimeDefault` or `Localhost`
  - `capabilities.drop: [ALL]`, with only `NET_BIND_SERVICE` addable
- Container-level settings override pod-level ones ([k8s-secctx]).

**ConfigMap as a file with `subPath`**
- Use `items: [{key, path}]` to place a key at a file path ([k8s-cm-task]).
- Mounting over a directory hides the image's files there ([k8s-cm-task]).
- **"A container using a ConfigMap as a `subPath` volume mount will not receive updates when the ConfigMap changes"** ([k8s-volumes], [k8s-cm-task]). Pair it with the `checksum/config` annotation.
- Non-subPath mounts refresh after about the kubelet sync period plus the cache TTL ([k8s-cm-task]).

**Secrets as environment variables**
- Use `env[].valueFrom.secretKeyRef`. Environment variables are not updated when the Secret changes, so the container must restart ([k8s-secret]). The checksum annotation over the Secret template handles this.
- A missing Secret or key makes the Pod fail at startup unless `optional` is set ([k8s-secret]).
- `stringData` is merged into `data` ([k8s-secret]).

**`imagePullPolicy`** ([k8s-images])
- `IfNotPresent` pulls "only if it is not already present locally".
- `Never`: "does not try fetching … otherwise, startup fails".
- Default: `Always` for `:latest` or no tag, otherwise `IfNotPresent`. The default "is always set when the object is first created, and is not updated if the image's tag … later changes."

**Service (v1)**
- ClusterIP is the default and is reachable in-cluster only ([k8s-svc]).
- LoadBalancer is provisioned asynchronously. Its status appears in `.status.loadBalancer`, and a ClusterIP and NodePort are also allocated ([k8s-svc]).
- `targetPort` defaults to `port` ([k8s-svc]).
- With more than one port, every port needs a name ([k8s-svc]).

**DNS**
- Services get `my-svc.my-namespace.svc.cluster-domain.example`, and `cluster.local` is the default domain ([k8s-dns]).
- A bare name resolves within the pod's own namespace. Cross-namespace lookups need `<svc>.<ns>` or the FQDN ([k8s-dns]).

### 4. Docker Desktop Kubernetes

- **Provisioners** ([dd-k8s]):

  | | kubeadm | kind |
  |---|---|---|
  | Nodes | single | multi |
  | Version | set by Docker Desktop | selectable |
  | Docker image store | works | does not work |
  | containerd image store | works | works |

- The containerd image store "is enabled by default in Docker Desktop version 4.34 and later" ([dd-containerd]).
- Clusters are not upgraded automatically; upgrading needs **Reset cluster** ([dd-k8s]).
- Release-note component lists ([dd-relnotes]):
  - kubeadm mode ships `cri-dockerd`, which is "a shim for Docker Engine that lets you control Docker via the Kubernetes Container Runtime Interface" ([cri-dockerd]).
  - kind mode ships `docker/desktop-containerd-registry-mirror`, `docker/desktop-cloud-provider-kind` and `envoyproxy/envoy`.
- **LoadBalancer on localhost:** current docs.docker.com pages do not document this.
  - A Docker blog post (2022, pre-kind, labelled blog) says Services of type LoadBalancer are reachable at `localhost:<port>` via vpnkit-controller, "a port forwarding service which opens ports on the host" ([docker-blog-2022]).
  - For kind mode, upstream cloud-provider-kind on macOS maps an **ephemeral** host port through a `kindccm-…` container (`--enable-lb-port-mapping`) ([cpk]). How Docker's fork behaves is undocumented.
  - See Open questions.
- **Locally built images:** the same 2022 blog says Kubernetes can use images from the Docker Engine cache without pushing, when `imagePullPolicy: IfNotPresent` ([docker-blog-2022]). That text describes dockershim, which has since been removed. See Open questions.
- **Default StorageClass:** the name `hostpath` is not documented on docs.docker.com (UNVERIFIED). A PVC that omits `storageClassName` binds to the cluster default. `""` means "no class" ([k8s-pv]). So leave it unset in values by default.
- **Reaching the host from pods:** `host.docker.internal` "Resolves to the internal IP address of your host" for containers ([dd-net-howto]). Whether it applies inside Kubernetes pods is not documented (see Open questions).

## Gotchas

1. **Don't template a `Namespace` for the release namespace.**
   - `--create-namespace` creates it outside the release manifest, labelled only `name: <ns>` ([helm-src-install]).
   - A templated Namespace of the same name would then exist without Helm's ownership label and annotations, and fail with "exists and cannot be imported into the current release: invalid ownership metadata" ([helm-src-validate]). This is inferred from the code.
   - Since the namespace is not in the manifest, `helm uninstall` leaves it. Delete it with `kubectl delete ns wechart`, which "deletes everything under the namespace!", including kept Secrets and PVCs ([k8s-ns]).
2. **Random values under `lookup`:**
   - `helm template`, `--dry-run`/`--dry-run=client` and `helm lint` all see an empty `lookup` ([helm-src-funcs], [helm-src-engine]), so every render shows new random secrets. Snapshot tests of rendered Secrets must not assert the values.
   - Only real installs and upgrades, and `--dry-run=server`, reuse the live values ([helm-lookup]).
   - If someone deletes the Secret, the next upgrade regenerates it, and the retained Postgres data keeps the old password ([pg-hub]).
3. **`--wait` and LoadBalancer:**
   - In 3.17.2 `--wait` blocks until `status.loadBalancer.ingress` is set ([helm-src-ready]).
   - If Docker Desktop never populates it (no LB controller, or a host-port conflict: UNVERIFIED), the install times out after 5m and the release is `failed` (or uninstalled with `--atomic`) ([helm-src-install]).
   - `--atomic` then also deletes the failing pods you'd want to inspect. This is inferred from the uninstall and rollback path.
4. **`--wait` does not order startup.**
   - Everything is created at once ([helm-src-install]), so API and Cube pods start before Postgres or Cube Store are ready.
   - They need retrying clients or startup and readiness probes, not a Helm ordering.
   - A StatefulSet with `updateStrategy: OnDelete` is treated as ready without checking ([helm-src-ready]).
5. **Immutable fields.**
   - The Deployment `selector` ([k8s-deploy]) and StatefulSet `selector`, `serviceName` and `volumeClaimTemplates` ([k8s-apps-validation]) cannot change on `helm upgrade`.
   - Fix label helpers and PVC sizes before the first install. Otherwise recover with `kubectl delete sts --cascade=orphan` ([k8s-sts-delete]).
6. **PVCs survive uninstall** (default `Retain`) ([k8s-sts]). A reinstall reattaches the old data. That is good for AC-014/AC-181-style persistence, but it means Postgres ignores new `POSTGRES_*` init variables ([pg-hub]).
7. **`helm lint` passes with missing `required` values** (it only logs INFO) ([helm-src-engine]). Also run `helm template` with representative values, which does fail, and use `values.schema.json` ([helm-charts]).
8. **Service-link environment variables.**
   - Every Service injects `{SVCNAME}_SERVICE_HOST`, `{SVCNAME}_SERVICE_PORT` and Docker-link style `{SVCNAME}_PORT=tcp://ip:port` into pods created after it ([k8s-svc]).
   - Example: a Service literally named `cubestore` would inject `CUBESTORE_PORT=tcp://…`, and Cube Store reads `CUBESTORE_PORT` as its MySQL port (`./cube/pre-aggregations.md`). With the `wechart-` fullname prefix the variable becomes `WECHART_CUBESTORE_PORT`.
   - `enableServiceLinks: false` turns this off ("Optional: Defaults to true") ([k8s-pod-api]). Variables for the control-plane namespace's services are still injected ([k8s-i120953]).
9. **`subPath` ConfigMap mounts never update** ([k8s-volumes]). Always pair them with `checksum/config`.
10. **`runAsNonRoot` with a named image `USER`** fails at container create ([k8s-kubelet-nonroot]). Set a numeric `runAsUser`.
11. **Interrupted runs.** A hard-killed Helm process can leave the release `pending-*`, after which upgrades fail with "another operation (install/upgrade/rollback) is in progress" ([helm-src-action]). Ctrl-C is handled and records `failed` ([helm-src-cmd-install], [helm-src-install]).
12. **Symlinks inside the chart are followed**, including to targets outside it, with a stderr warning ([helm-src-sympath]). Keep the chart free of symlinks so the packaged chart is self-contained.
13. **The release record is stored in Kubernetes**, and "Charts must be smaller than 1M" ([helm-files]). Keep large files, such as Cube model fixtures, out of `.Files`.
14. **Security advisories that affect 3.17.2** (chart-loading or dependency paths; wechart uses a local, trusted chart and no `helm dependency update`):
    - CVE-2025-32386: an archive expansion OOM, fixed in 3.17.3 ([ghsa-4hfp]). The advisory page reads "< 3.17.2" but names 3.17.3 as the fix; treat 3.17.2 as affected.
    - CVE-2025-53547: Chart.yaml plus a symlinked Chart.lock on dependency update. It affects "v3.17.3 and earlier" and is fixed in 3.17.4 / 3.18.4 ([ghsa-557j]).
    - The advisory list also includes GHSA-5xqw (JSON-schema stack overflow) and GHSA-f9f8 / GHSA-9h84 (YAML panic and schema memory) ([ghsa-list]). Their affected ranges were not checked.
15. **Helm docs default to v4 now.** helm.sh/docs is Helm 4.3.0, and v3 lives under `/docs/v3/`, which documents 3.22.0 ([helm-lookup-v4-note]). Cite v3 pages or the v3.17.2 source only.

## Open questions / unverified

- **UNVERIFIED — which Docker Desktop provisioner this cluster uses (kubeadm or kind).** This decides the next two items. Check with `kubectl get nodes` and the Docker Desktop Kubernetes settings.
- **UNVERIFIED — a LoadBalancer Service is published on host `localhost:<service port>`.**
  - Only a 2022 Docker blog says so ([docker-blog-2022]). Current docs are silent ([dd-k8s]).
  - For kind mode, upstream cloud-provider-kind uses an ephemeral host port ([cpk]).
  - What I tried: docs.docker.com Kubernetes and networking pages, the release notes, and the docker/docs source for the Kubernetes page.
  - Verify on the cluster:
    - `kubectl -n <ns> get svc` for an existing LoadBalancer (EXTERNAL-IP / PORT). The project memory lists Metabase on :3000 and Superset on :8088 on this cluster, but not how they are exposed.
    - `docker ps` for `kindccm-*` containers.
  - Also check host-port conflicts with :3000 and :8088.
- **UNVERIFIED — images from `docker build` are visible to the cluster without a registry** on the current Docker Desktop and its containerd image store. The kubeadm path via cri-dockerd is plausible ([dd-relnotes], [cri-dockerd]), and kind mode ships a "containerd registry mirror" whose behaviour is undocumented. Verify with a pod using `imagePullPolicy: Never` on a locally built tag.
- **UNVERIFIED — default StorageClass name (`hostpath`) and binding mode, and whether its PVs are hostPath volumes** (which ignore `fsGroup`, [k8s-hostpath-go]). Check with `kubectl get storageclass` and `kubectl get pv -o yaml`. Also unverified: whether PV data survives "Reset cluster" (a third-party blog claims it does not).
- **UNVERIFIED — `host.docker.internal` resolves from pods.** It matters only if the Cube data source in values points at a host service such as the compose Postgres ([dd-net-howto] covers containers only).
- **Version skew:** Helm 3.17.2 officially supports K8s 1.29–1.32, and the cluster is 1.34.1 ([helm-skew]). No specific incompatibility was found. Consider whether the stack should pin a Helm 3.19+ CLI. That is the user's decision.
- The Kubernetes docs pages cited are the current (latest) versions. Code-level claims about Kubernetes behaviour are pinned to v1.34.1 source where it mattered (apps validation, kubelet runAsNonRoot, hostPath).

[helm-rel-3172]: https://github.com/helm/helm/releases/tag/v3.17.2
[helm-rel-3170]: https://github.com/helm/helm/releases/tag/v3.17.0
[helm-charts]: https://helm.sh/docs/v3/topics/charts/
[helm-lookup]: https://helm.sh/docs/v3/chart_template_guide/functions_and_pipelines/#using-the-lookup-function
[helm-lookup-v4-note]: https://helm.sh/docs/chart_template_guide/functions_and_pipelines/
[helm-funclist]: https://helm.sh/docs/v3/chart_template_guide/function_list/
[helm-named]: https://helm.sh/docs/v3/chart_template_guide/named_templates/
[helm-files]: https://helm.sh/docs/v3/chart_template_guide/accessing_files/
[helm-tips]: https://helm.sh/docs/v3/howto/charts_tips_and_tricks/
[helm-labels]: https://helm.sh/docs/v3/chart_best_practices/labels/
[helm-values-bp]: https://helm.sh/docs/v3/chart_best_practices/values/
[helm-upgrade-cmd]: https://helm.sh/docs/v3/helm/helm_upgrade/
[helm-uninstall-cmd]: https://helm.sh/docs/v3/helm/helm_uninstall/
[helm-skew]: https://helm.sh/docs/v3/topics/version_skew/
[helm-eol]: https://helm.sh/blog/helm-v3-end-of-life/
[helm-changes]: https://helm.sh/docs/v3/faq/changes_since_helm2/
[helm-src-lookup]: https://github.com/helm/helm/blob/v3.17.2/pkg/engine/lookup_func.go
[helm-src-funcs]: https://github.com/helm/helm/blob/v3.17.2/pkg/engine/funcs.go
[helm-src-engine]: https://github.com/helm/helm/blob/v3.17.2/pkg/engine/engine.go
[helm-src-action]: https://github.com/helm/helm/blob/v3.17.2/pkg/action/action.go
[helm-src-install]: https://github.com/helm/helm/blob/v3.17.2/pkg/action/install.go
[helm-src-upgrade]: https://github.com/helm/helm/blob/v3.17.2/pkg/action/upgrade.go
[helm-src-uninstall]: https://github.com/helm/helm/blob/v3.17.2/pkg/action/uninstall.go
[helm-src-validate]: https://github.com/helm/helm/blob/v3.17.2/pkg/action/validate.go
[helm-src-package]: https://github.com/helm/helm/blob/v3.17.2/pkg/action/package.go
[helm-src-action-lint]: https://github.com/helm/helm/blob/v3.17.2/pkg/action/lint.go
[helm-src-ready]: https://github.com/helm/helm/blob/v3.17.2/pkg/kube/ready.go
[helm-src-wait]: https://github.com/helm/helm/blob/v3.17.2/pkg/kube/wait.go
[helm-src-kindsorter]: https://github.com/helm/helm/blob/v3.17.2/pkg/releaseutil/kind_sorter.go
[helm-src-cmd-install]: https://github.com/helm/helm/blob/v3.17.2/cmd/helm/install.go
[helm-src-cmd-upgrade]: https://github.com/helm/helm/blob/v3.17.2/cmd/helm/upgrade.go
[helm-src-cmd-template]: https://github.com/helm/helm/blob/v3.17.2/cmd/helm/template.go
[helm-src-cmd-lint]: https://github.com/helm/helm/blob/v3.17.2/cmd/helm/lint.go
[helm-src-lint-rules]: https://github.com/helm/helm/blob/v3.17.2/pkg/lint/rules/template.go
[helm-src-main]: https://github.com/helm/helm/blob/v3.17.2/cmd/helm/helm.go
[helm-src-create]: https://github.com/helm/helm/blob/v3.17.2/pkg/chartutil/create.go
[helm-src-metadata]: https://github.com/helm/helm/blob/v3.17.2/pkg/chart/metadata.go
[helm-src-load]: https://github.com/helm/helm/blob/v3.17.2/pkg/chart/loader/load.go
[helm-src-loaddir]: https://github.com/helm/helm/blob/v3.17.2/pkg/chart/loader/directory.go
[helm-src-sympath]: https://github.com/helm/helm/blob/v3.17.2/internal/sympath/walk.go
[helm-src-ignore]: https://github.com/helm/helm/blob/v3.17.2/pkg/ignore/rules.go
[ghsa-list]: https://github.com/helm/helm/security/advisories
[ghsa-4hfp]: https://github.com/helm/helm/security/advisories/GHSA-4hfp-h4cw-hj8p
[ghsa-557j]: https://github.com/helm/helm/security/advisories/GHSA-557j-xg8c-q2mm
[sprig-strings]: https://masterminds.github.io/sprig/strings.html
[sprig-dicts]: https://masterminds.github.io/sprig/dicts.html
[k8s-sts]: https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/
[k8s-sts-api]: https://kubernetes.io/docs/reference/kubernetes-api/workload-resources/stateful-set-v1/
[k8s-sts-gate]: https://github.com/kubernetes/website/blob/main/content/en/docs/reference/command-line-tools-reference/feature-gates/StatefulSetAutoDeletePVC.md
[k8s-sts-tutorial]: https://kubernetes.io/docs/tutorials/stateful-application/basic-stateful-set/
[k8s-sts-delete]: https://kubernetes.io/docs/tasks/run-application/delete-stateful-set/
[k8s-apps-validation]: https://github.com/kubernetes/kubernetes/blob/v1.34.1/pkg/apis/apps/validation/validation.go
[k8s-deploy]: https://kubernetes.io/docs/concepts/workloads/controllers/deployment/
[k8s-probes]: https://kubernetes.io/docs/concepts/workloads/pods/probes/
[k8s-probes-concept]: https://kubernetes.io/docs/concepts/configuration/liveness-readiness-startup-probes/
[k8s-probes-task]: https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/
[k8s-secctx]: https://kubernetes.io/docs/tasks/configure-pod-container/security-context/
[k8s-pss]: https://kubernetes.io/docs/concepts/security/pod-security-standards/
[k8s-pod-api]: https://kubernetes.io/docs/reference/kubernetes-api/workload-resources/pod-v1/
[k8s-kubelet-nonroot]: https://github.com/kubernetes/kubernetes/blob/v1.34.1/pkg/kubelet/kuberuntime/security_context_others.go
[k8s-hostpath-go]: https://github.com/kubernetes/kubernetes/blob/v1.34.1/pkg/volume/hostpath/host_path.go
[k8s-volumes]: https://kubernetes.io/docs/concepts/storage/volumes/
[k8s-cm-task]: https://kubernetes.io/docs/tasks/configure-pod-container/configure-pod-configmap/
[k8s-secret]: https://kubernetes.io/docs/concepts/configuration/secret/
[k8s-images]: https://kubernetes.io/docs/concepts/containers/images/
[k8s-svc]: https://kubernetes.io/docs/concepts/services-networking/service/
[k8s-dns]: https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/
[k8s-pv]: https://kubernetes.io/docs/concepts/storage/persistent-volumes/
[k8s-labels]: https://kubernetes.io/docs/concepts/overview/working-with-objects/common-labels/
[k8s-ns]: https://kubernetes.io/docs/tasks/administer-cluster/namespaces/
[k8s-i120953]: https://github.com/kubernetes/kubernetes/issues/120953
[dd-k8s]: https://docs.docker.com/desktop/use-desktop/kubernetes/
[dd-relnotes]: https://docs.docker.com/desktop/release-notes/
[dd-containerd]: https://docs.docker.com/desktop/features/containerd/
[dd-net-howto]: https://docs.docker.com/desktop/features/networking/networking-how-tos/
[docker-blog-2022]: https://www.docker.com/blog/how-kubernetes-works-under-the-hood-with-docker-desktop/
[cpk]: https://github.com/kubernetes-sigs/cloud-provider-kind
[cri-dockerd]: https://github.com/Mirantis/cri-dockerd
[pg-hub]: https://hub.docker.com/_/postgres
