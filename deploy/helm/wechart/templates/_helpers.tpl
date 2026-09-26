{{/*
Names and labels shared by every object (docs/research/helm.md, "Chart layout").
*/}}

{{- define "wechart.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/* The release's name, or release-chart when the release name does not say wechart already. */}}
{{- define "wechart.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/* One component's object name: include "wechart.component" (list . "api") */}}
{{- define "wechart.component" -}}
{{- $root := index . 0 }}
{{- printf "%s-%s" (include "wechart.fullname" $root) (index . 1) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/* A component's in-cluster DNS name, fully qualified: include "wechart.host" (list . "api") */}}
{{- define "wechart.host" -}}
{{- $root := index . 0 }}
{{- printf "%s.%s.svc.cluster.local" (include "wechart.component" .) $root.Release.Namespace }}
{{- end }}

{{- define "wechart.selectorLabels" -}}
{{- $root := index . 0 -}}
app.kubernetes.io/name: {{ include "wechart.name" $root }}
app.kubernetes.io/instance: {{ $root.Release.Name }}
app.kubernetes.io/component: {{ index . 1 }}
{{- end }}

{{- define "wechart.labels" -}}
{{- $root := index . 0 -}}
helm.sh/chart: {{ printf "%s-%s" $root.Chart.Name $root.Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{ include "wechart.selectorLabels" . }}
app.kubernetes.io/version: {{ $root.Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ $root.Release.Service }}
app.kubernetes.io/part-of: wechart
{{- end }}

{{/* The Secret holding what the chart generates at install (templates/secrets.yaml). */}}
{{- define "wechart.secretName" -}}
{{- include "wechart.component" (list . "secrets") }}
{{- end }}

{{/* A wechart image: include "wechart.image" (list . .Values.images.api) */}}
{{- define "wechart.image" -}}
{{- $root := index . 0 }}
{{- printf "%s:%s" (index . 1) (default $root.Chart.AppVersion $root.Values.images.tag) }}
{{- end }}

{{/*
Sign-in (T324): the issuer wechart and the browser use — the values' own, or
with the bundled Dex, Dex as the browser reaches it on the host.
*/}}
{{- define "wechart.oidcIssuer" -}}
{{- $s := .Values.security -}}
{{- if $s.oidc.issuer }}{{ $s.oidc.issuer }}
{{- else if $s.dex.enabled }}{{ printf "http://localhost:%d/dex" (int $s.dex.port) }}
{{- else }}{{ fail "security.oidc.issuer is required when security.enabled and not security.dex.enabled" }}
{{- end }}
{{- end }}

{{/* The Secret and key holding the OIDC client's secret: the values' own, or the chart's for its Dex. */}}
{{- define "wechart.oidcClientSecretRef" -}}
{{- $ref := .Values.security.oidc.clientSecret -}}
name: {{ default (include "wechart.secretName" .) $ref.name }}
key: {{ if $ref.name }}{{ $ref.key | default "client-secret" }}{{ else }}oidc-client-secret{{ end }}
{{- end }}

{{/*
The environment Cube's API and its refresh worker share, as docker-compose
gives it to them. The data source is the values' own: CUBEJS_DB_* variables
(docs/research/cube/configuration-deployment.md §4), the password from a
Secret the values name, never from the values themselves.
*/}}
{{- define "wechart.cubeEnv" -}}
{{- $ds := .Values.cube.dataSource -}}
- name: CUBEJS_DB_TYPE
  value: {{ required "cube.dataSource.type is required: Cube's driver, e.g. postgres" $ds.type | quote }}
{{- range $variable, $key := dict "CUBEJS_DB_HOST" "host" "CUBEJS_DB_PORT" "port" "CUBEJS_DB_NAME" "database" "CUBEJS_DB_USER" "user" }}
{{- with index $ds $key }}
- name: {{ $variable }}
  value: {{ . | toString | quote }}
{{- end }}
{{- end }}
{{- with $ds.passwordSecret }}
{{- if .name }}
- name: CUBEJS_DB_PASS
  valueFrom:
    secretKeyRef:
      name: {{ .name }}
      key: {{ .key | default "password" }}
{{- end }}
{{- end }}
{{- range $variable, $value := $ds.env }}
- name: {{ $variable }}
  value: {{ $value | toString | quote }}
{{- end }}
{{- range $variable, $ref := $ds.secretEnv }}
- name: {{ $variable }}
  valueFrom:
    secretKeyRef:
      name: {{ required (printf "cube.dataSource.secretEnv.%s.name is required" $variable) $ref.name }}
      key: {{ required (printf "cube.dataSource.secretEnv.%s.key is required" $variable) $ref.key }}
{{- end }}
# wechart signs every request with this, and is the only other holder (AC-007, AC-008).
- name: CUBEJS_API_SECRET
  valueFrom:
    secretKeyRef:
      name: {{ include "wechart.secretName" . }}
      key: cube-api-secret
# Cube Store's HTTP port, which is what Cube speaks to.
- name: CUBEJS_CUBESTORE_HOST
  value: {{ include "wechart.host" (list . "cubestore") | quote }}
- name: CUBEJS_CUBESTORE_PORT
  value: "3030"
# Production mode: no Playground, authentication enforced.
- name: CUBEJS_DEV_MODE
  value: "false"
- name: NODE_ENV
  value: production
# xcube's schema in the metadata database, where the model this release's API
# pushes is served from (T447, AC-333; infra/cube/cube.js). Cube never calls
# the API.
- name: XCUBE_DATABASE_URL
  valueFrom:
    secretKeyRef:
      name: {{ include "wechart.secretName" . }}
      key: xcube-db-url
{{- range $variable, $value := .Values.cube.env }}
- name: {{ $variable }}
  value: {{ $value | toString | quote }}
{{- end }}
{{- end }}
