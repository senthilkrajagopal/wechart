#!/usr/bin/env bash
# T274 (AC-248): the test for the wechart Helm chart, run against a real
# cluster. It fails when a component is not Ready after the install, when the
# web app's address does not load, or when a query from the web app does not
# reach the data source the values name.
#
#   deploy/helm/verify.sh               lint, install or upgrade, then check
#   deploy/helm/verify.sh --no-install  check the release already installed
#
# Environment: KUBE_CONTEXT (docker-desktop), NAMESPACE (wechart), RELEASE
# (wechart), VALUES (deploy/helm/values/docker-desktop.yaml), IMAGE_TAG (the
# tag both wechart images were built with; the values' own when unset),
# PROBE_TABLE (a table in the data source; public.orders, northwind's).
#
# The query check publishes one cube on PROBE_TABLE through wechart's API, as
# the Model workspace does, asks the API for its count, and then removes the
# file again from wechart's metadata database: the API publishes and never
# deletes a model file, so that is the only way to leave the model as it was.
#
# Needs helm, kubectl, curl and jq (docs/deploy.md).

set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
chart="$here/wechart"
context="${KUBE_CONTEXT:-docker-desktop}"
namespace="${NAMESPACE:-wechart}"
release="${RELEASE:-wechart}"
values="${VALUES:-$here/values/docker-desktop.yaml}"
probe_table="${PROBE_TABLE:-public.orders}"
probe_path='wechart-verify/data-source-probe.yml'
probe_cube='wechart_verify_probe'

install=1
if [[ "${1:-}" == '--no-install' ]]; then install=0; fi

failures=0
pass() { printf 'PASS  %s\n' "$*"; }
fail() {
  printf 'FAIL  %s\n' "$*"
  failures=$((failures + 1))
}
k() { kubectl --context "$context" -n "$namespace" "$@"; }
h() { helm --kube-context "$context" -n "$namespace" "$@"; }

for tool in helm kubectl curl jq; do
  command -v "$tool" > /dev/null || {
    echo "verify.sh needs $tool on the PATH" >&2
    exit 2
  }
done

# Never empty, so "${values_args[@]}" is safe under `set -u` in macOS's bash 3.2.
values_args=(-f "$values")
if [[ -n "${IMAGE_TAG:-}" ]]; then values_args+=(--set "images.tag=$IMAGE_TAG"); fi

# 1. The chart lints and renders.
if helm lint "$chart" "${values_args[@]}" > /dev/null; then
  pass '1. helm lint'
else
  fail '1. helm lint'
  helm lint "$chart" "${values_args[@]}"
fi
if helm template "$release" "$chart" -n "$namespace" "${values_args[@]}" > /dev/null; then
  pass '1. helm template'
else
  fail '1. helm template'
fi

# 2. Installed with --wait, every component is Ready.
if ((install)); then
  if h upgrade --install "$release" "$chart" --create-namespace "${values_args[@]}" \
    --wait --timeout 10m > /dev/null; then
    pass '2. helm upgrade --install --wait'
  else
    fail '2. helm upgrade --install --wait'
  fi
fi

workloads="$(k get deployments,statefulsets -l "app.kubernetes.io/instance=$release" -o json)"
for component in web api meta cube cube-refresh-worker cubestore; do
  state="$(jq -r --arg c "$component" '
    [.items[] | select(.metadata.labels["app.kubernetes.io/component"] == $c)]
    | if length == 0 then "missing"
      else .[0] | "\(.kind)/\(.metadata.name) \(.status.readyReplicas // 0)/\(.spec.replicas)" end
  ' <<< "$workloads")"
  if [[ "$state" =~ \ ([0-9]+)/([0-9]+)$ ]] && ((BASH_REMATCH[1] >= 1 && BASH_REMATCH[1] == BASH_REMATCH[2])); then
    pass "2. $component Ready: $state"
  else
    fail "2. $component not Ready: $state"
  fi
done

# 3. The web app loads at the address the values name: the port from the
# release's values, on the host the LoadBalancer Service is published at.
if ! release_values="$(h get values "$release" --all -o json)"; then
  fail "no release $release in $namespace to check"
  echo
  echo "$failures check(s) failed"
  exit 1
fi
port="$(jq -r '.web.service.port' <<< "$release_values")"
host="$(k get services -l "app.kubernetes.io/instance=$release,app.kubernetes.io/component=web" \
  -o jsonpath='{.items[0].status.loadBalancer.ingress[0].hostname}{.items[0].status.loadBalancer.ingress[0].ip}')"
url="http://${host:-localhost}:$port"
echo "      web app: $url"

body="$(mktemp)"
trap 'rm -f "$body"' EXIT
fetch() { curl -sS -o "$body" -w '%{http_code}' --max-time 30 "$@"; }

for path in / /explore /model/files/cubes/orders.yml; do
  status="$(fetch "$url$path")"
  if [[ "$status" == 200 ]] && grep -q '<div id="root"></div>' "$body"; then
    pass "3. $path serves the app (200, #root)"
  else
    fail "3. $path answered $status without the app's root element"
  fi
done
script="$(fetch "$url/" > /dev/null && grep -oE '/assets/[^"]+\.js' "$body" | head -n 1)"
status="$(fetch "$url$script")"
if [[ -n "$script" && "$status" == 200 ]]; then
  pass "3. the app's script loads ($script)"
else
  fail "3. the app's script ($script) answered $status"
fi
status="$(fetch "$url/assets/no-such-file.js")"
if [[ "$status" == 404 ]]; then
  pass '3. a missing asset is a 404, not the app'
else
  fail "3. a missing asset answered $status"
fi
status="$(fetch "$url/api/cube-model/files")"
if [[ "$status" == 404 ]]; then
  pass "3. Cube's model routes are not served to the browser"
else
  fail "3. /api/cube-model/files answered $status from outside the cluster"
fi

# 4. The API is up, and says Cube and its refresh worker are healthy (their
# own /readyz and /livez, asked from inside the cluster).
status="$(fetch "$url/api/health")"
if [[ "$status" == 200 ]] && jq -e '.status == "ok"' "$body" > /dev/null; then
  pass '4. /api/health ok'
else
  fail "4. /api/health answered $status: $(cat "$body")"
fi
status="$(fetch "$url/api/cube-health")"
if [[ "$status" == 200 ]] && jq -e '.cube == "healthy" and .worker == "healthy"' "$body" > /dev/null; then
  pass "4. /api/cube-health: $(jq -c . "$body")"
else
  fail "4. /api/cube-health answered $status: $(cat "$body")"
fi

# 5. A query from the web app reaches the data source the values name.
meta_pod="$(k get pods -l "app.kubernetes.io/instance=$release,app.kubernetes.io/component=meta" \
  -o jsonpath='{.items[0].metadata.name}')"
meta_user="$(jq -r '.meta.user' <<< "$release_values")"
meta_db="$(jq -r '.meta.database' <<< "$release_values")"
remove_probe() {
  # The official image trusts connections over its own socket (docs/research/postgres-image.md).
  k exec "$meta_pod" -c postgres -- psql -U "$meta_user" -d "$meta_db" -v ON_ERROR_STOP=1 -qAt \
    -c "delete from model_files where path = '$probe_path' returning path" | grep -q .
}

status="$(fetch "$url/api/model/files")"
if [[ "$status" != 200 ]]; then
  fail "5. /api/model/files answered $status"
elif jq -e --arg p "$probe_path" 'any(.files[]; .path == $p)' "$body" > /dev/null; then
  fail "5. $probe_path is already in the model; remove it before verifying"
else
  source="$(jq -r '.cube.dataSource | "\(.type)://\(.user)@\(.host):\(.port)/\(.database)"' \
    <<< "$release_values")"
  echo "      data source: $source, table $probe_table"
  content="$(printf 'cubes:\n  - name: %s\n    sql_table: %s\n    measures:\n      - name: count\n        type: count\n' \
    "$probe_cube" "$probe_table")"
  request="$(jq -n --arg path "$probe_path" --arg content "$content" '{files: [{path: $path, content: $content}]}')"
  status="$(fetch -X POST -H 'content-type: application/json' --data "$request" "$url/api/model/publish")"
  published=0
  if [[ "$status" == 200 ]]; then
    published=1
    pass "5. published $probe_path through /api/model/publish"
    query="$(jq -n --arg m "$probe_cube.count" '{query: {measures: [$m]}}')"
    # Asked again while Cube answers "Continue wait", as the web app does
    # (packages/web/src/query/loadTile.ts).
    for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do
      status="$(fetch -X POST -H 'content-type: application/json' --data "$query" "$url/api/load")"
      jq -e '.error == "Continue wait"' "$body" > /dev/null 2>&1 || break
    done
    count="$(jq -r --arg m "$probe_cube.count" '.data[0][$m] // empty' "$body" 2> /dev/null)"
    if [[ "$status" == 200 && "$count" =~ ^[0-9]+$ ]] && ((count > 0)); then
      pass "5. /api/load counted $count rows of $probe_table in $source"
    else
      fail "5. /api/load answered $status: $(head -c 600 "$body")"
    fi
  else
    fail "5. /api/model/publish answered $status: $(head -c 600 "$body")"
  fi
  if remove_probe; then
    status="$(fetch "$url/api/model/files")"
    if [[ "$status" == 200 ]] && ! jq -e --arg p "$probe_path" 'any(.files[]; .path == $p)' "$body" > /dev/null; then
      pass "5. removed $probe_path again"
    else
      fail "5. $probe_path is still listed after its removal"
    fi
  elif ((published)); then
    fail "5. could not remove $probe_path from the model; delete it in the metadata database"
  fi
fi

echo
if ((failures)); then
  echo "$failures check(s) failed"
  exit 1
fi
echo 'all checks passed'
