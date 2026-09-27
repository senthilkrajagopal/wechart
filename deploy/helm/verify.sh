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
# (wechart), VALUES (deploy/helm/values/docker-desktop.yaml), EXTRA_VALUES
# (more values files over it, colon-separated; with
# deploy/helm/values/docker-desktop-security.yaml, sign-in is on and checked
# through Dex, T324), IMAGE_TAG (the
# tag both wechart images were built with; the values' own when unset),
# PROBE_TABLE (a table in the data source; public.orders, northwind's).
#
# The query check publishes one cube on PROBE_TABLE through wechart's API, as
# the Model workspace does, asks the API for its count, and then removes the
# file again from wechart's metadata database: the API publishes and never
# deletes a model file, so that is the only way to leave the model as it was.
#
# Step 6 (T447) checks that xcube serves the model: with no API replica and
# Cube restarted, and with two API replicas. It signs one Cube token itself,
# with openssl.
#
# Step 7 (T423) stops one Cube instance and one API replica with a slow query
# in flight, and checks the query, the session and both Deployments.
#
# Needs helm, kubectl, curl, jq and openssl (docs/deploy.md).

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

for tool in helm kubectl curl jq openssl; do
  command -v "$tool" > /dev/null || {
    echo "verify.sh needs $tool on the PATH" >&2
    exit 2
  }
done

# Never empty, so "${values_args[@]}" is safe under `set -u` in macOS's bash 3.2.
values_args=(-f "$values")
# More values files laid over it, colon-separated: sign-in on Docker Desktop is
# EXTRA_VALUES=deploy/helm/values/docker-desktop-security.yaml (T324).
if [[ -n "${EXTRA_VALUES:-}" ]]; then
  IFS=: read -r -a extra <<< "$EXTRA_VALUES"
  for file in "${extra[@]}"; do values_args+=(-f "$file"); done
fi
# --set-string: a short commit hash of digits only (6141947) is otherwise a
# number, and the image becomes `wechart-api:%!s(int64=6141947)`.
if [[ -n "${IMAGE_TAG:-}" ]]; then values_args+=(--set-string "images.tag=$IMAGE_TAG"); fi

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
# With sign-in on and no Super-Admin group, the chart refuses to render
# (T416, AC-318; the user's R26): nobody could reach the admin surfaces.
refusal=$(helm template "$release" "$chart" -n "$namespace" "${values_args[@]}" \
  --set security.enabled=true --set security.dex.enabled=true \
  --set-string security.publicUrl=http://localhost:8089 \
  --set-string security.superAdminGroup= 2>&1 > /dev/null)
if [[ $? -ne 0 && "$refusal" == *security.superAdminGroup* ]]; then
  pass '1. with sign-in on and no Super-Admin group, helm template refuses, naming security.superAdminGroup'
else
  fail "1. helm template rendered sign-in with no Super-Admin group, or refused for another reason: ${refusal:-no error}"
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
jar="$(mktemp)"
# Step 6 scales the API: an exit part-way, an interrupt included, puts it back
# to the release's replicas (T447's review).
api_replicas="$(jq -r '.api.replicas // 1' <<< "$release_values")"
api_scaled=0
on_exit() {
  rm -f "$body" "$jar" "$jar".*
  if ((api_scaled)); then
    k scale "deployment/$(k get deployments -l "app.kubernetes.io/instance=$release,app.kubernetes.io/component=api" \
      -o jsonpath='{.items[0].metadata.name}')" --replicas="$api_replicas" > /dev/null 2>&1
  fi
}
trap on_exit EXIT
trap 'exit 130' INT TERM
# With sign-in on, every check after the sign-in ones carries that session.
fetch() { curl -sS -o "$body" -w '%{http_code}' --max-time 30 -b "$jar" "$@"; }

# 3a. With sign-in on (T324, AC-251, AC-257): a page without a session goes
# to sign-in and the API refuses it; the development provider beside wechart
# signs a test user in through its own form, as a browser would.
security="$(jq -r '.security.enabled // false' <<< "$release_values")"
if [[ "$security" == true ]]; then
  users_file="$here/../../infra/dex/test-users.json"
  # Signs $1 (a test user) in through Dex's form into cookie jar $2.
  sign_in() {
    local email password dex page action
    email="$(jq -r --arg u "$1" '.[$u].email' "$users_file")"
    password="$(jq -r --arg u "$1" '.[$u].password' "$users_file")"
    dex="$(curl -sS -c "$2" -b "$2" -o /dev/null -w '%{redirect_url}' --max-time 30 \
      "$url/api/auth/login?returnTo=/explore")"
    # Dex, with one connector, sends /auth on to its login form.
    page="$(curl -sS -L -c "$2" -b "$2" -o "$body" -w '%{url_effective}' --max-time 30 "$dex")"
    action="$(grep -oE '<form[^>]*method="post"[^>]*action="[^"]+"' "$body" | sed -E 's/.*action="([^"]+)".*/\1/; s/&amp;/\&/g')"
    [[ -n "$action" ]] || return 1
    # Posted, then through Dex's approval (skipped) and wechart's callback,
    # which sets the session cookie, to /explore.
    curl -sS -L -c "$2" -b "$2" -o /dev/null -w '%{url_effective}' --max-time 30 \
      --data-urlencode "login=$email" --data-urlencode "password=$password" \
      "$(sed -E 's#^(https?://[^/]+).*#\1#' <<< "$page")$action"
  }

  location="$(curl -sS -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 30 "$url/explore")"
  if [[ "$location" == "302 $url/api/auth/login?returnTo=/explore" ]]; then
    pass '3a. /explore without a session goes to sign-in'
  else
    fail "3a. /explore without a session answered $location"
  fi
  status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 30 "$url/api/me")"
  if [[ "$status" == 401 ]]; then
    pass '3a. /api/me without a session answers 401'
  else
    fail "3a. /api/me without a session answered $status"
  fi
  # Sign-in's next hop is the provider, at the issuer the values give it.
  issuer="$(jq -r 'if (.security.oidc.issuer // "") != "" then .security.oidc.issuer
    else "http://localhost:\(.security.dex.port)/dex" end' <<< "$release_values")"
  hop="$(curl -sS -o /dev/null -w '%{redirect_url}' --max-time 30 "$url/api/auth/login?returnTo=/explore")"
  if [[ "$hop" == "$issuer/auth?"* ]]; then
    pass "3a. sign-in goes on to the provider at $issuer"
  else
    fail "3a. sign-in went on to $hop, not $issuer/auth"
  fi
  if [[ "$(jq -r '.security.dex.enabled // false' <<< "$release_values")" == true ]]; then
    dex_state="$(k get deployments -l "app.kubernetes.io/instance=$release,app.kubernetes.io/component=dex" \
      -o jsonpath='{.items[0].status.readyReplicas}/{.items[0].spec.replicas}')"
    if [[ "$dex_state" == 1/1 ]]; then
      pass '3a. dex Ready: 1/1'
    else
      fail "3a. dex not Ready: $dex_state"
    fi
  fi
  landed="$(sign_in writer "$jar.writer")"
  status="$(curl -sS -o "$body" -w '%{http_code}' --max-time 30 -b "$jar.writer" "$url/api/me")"
  if [[ "$landed" == "$url/explore" && "$status" == 200 ]] &&
    jq -e '.name == "Wren Writer" and .groups == ["sales-rw"] and .security == "oidc"' "$body" > /dev/null; then
    pass "3a. writer signed in through Dex: $(jq -c '{name, groups}' "$body")"
  else
    fail "3a. writer's sign-in ended at $landed; /api/me answered $status: $(head -c 300 "$body")"
  fi
  # The checks below run signed in as super, the test user in the configured
  # Super-Admin group, which makes them a Super-Admin (T323, AC-256).
  if [[ "$(sign_in super "$jar")" == "$url/explore" ]]; then
    pass '3a. signed in as super for the checks below'
  else
    fail '3a. super could not sign in; the checks below run without a session'
  fi
  status="$(fetch "$url/api/me")"
  if [[ "$status" == 200 ]] && jq -e '.superAdmin == true' "$body" > /dev/null; then
    pass '3a. super is a Super-Admin, by the configured group'
  else
    fail "3a. super's /api/me answered $status: $(head -c 300 "$body")"
  fi
fi

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
# With sign-in on, every gated location refuses a request without a session,
# not only the pages (T324's review): the page itself and the app's files too.
if [[ "$security" == true ]]; then
  for path in /index.html "$script"; do
    status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 30 "$url$path")"
    if [[ "$status" == 302 ]]; then
      pass "3a. $path without a session goes to sign-in"
    else
      fail "3a. $path without a session answered $status"
    fi
  done
fi
status="$(fetch "$url/assets/no-such-file.js")"
if [[ "$status" == 404 ]]; then
  pass '3. a missing asset is a 404, not the app'
else
  fail "3. a missing asset answered $status"
fi
# Cube reads its model from xcube, and the API serves no route of the model
# store's (T431, AC-327): not found, or asked to sign in when security is on
# (the store's own route answered 401 too, but "Not Cube.").
status="$(fetch "$url/api/cube-model/files")"
if [[ "$status" == 404 ]] || {
  [[ "$security" == true && "$status" == 401 ]] &&
    jq -e '.error == "unauthenticated"' "$body" > /dev/null
}; then
  pass "3. the API serves no route for Cube to read the model through"
else
  fail "3. /api/cube-model/files answered $status"
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

# 4a. The shared root's `default` data source, seeded at install by a Job that
# seals the database password itself (T443, AC-310): there, and it connects.
seed_job="$(k get jobs -l "app.kubernetes.io/instance=$release,app.kubernetes.io/component=seed-default" \
  -o jsonpath='{.items[-1:].metadata.name}')"
if [[ -z "$seed_job" ]]; then
  fail '4a. no seed-default Job: the values name no data source with a password Secret'
elif ! k wait --for=condition=complete "job/$seed_job" --timeout=300s > /dev/null; then
  fail "4a. the seed-default Job didn't complete: $(k logs "job/$seed_job" --tail=5 2>&1 | tr '\n' ' ')"
else
  pass "4a. $seed_job completed: $(k logs "job/$seed_job" --tail=1 2>&1)"
  status="$(fetch "$url/api/data-sources")"
  root_default="$(jq -r '[.[] | select(.folderId == "root" and .name == "default")][0].id // empty' "$body" 2> /dev/null)"
  if [[ "$status" == 200 && -n "$root_default" ]]; then
    pass "4a. the shared root holds its default data source ($(jq -r --arg id "$root_default" '.[] | select(.id == $id) | .driver' "$body"))"
    status="$(fetch -X POST -H 'content-type: application/json' --data '{}' --max-time 90 "$url/api/data-sources/$root_default/test")"
    if [[ "$status" == 200 ]] && jq -e '.ok == true' "$body" > /dev/null; then
      pass '4a. it connects: every check xcube ran passed'
    else
      fail "4a. its connection test answered $status: $(head -c 300 "$body")"
    fi
  else
    fail "4a. no root default in /api/data-sources ($status): $(head -c 300 "$body")"
  fi
fi

# 5. A query from the web app reaches the data source the values name.
meta_pod="$(k get pods -l "app.kubernetes.io/instance=$release,app.kubernetes.io/component=meta" \
  -o jsonpath='{.items[0].metadata.name}')"
meta_user="$(jq -r '.meta.user' <<< "$release_values")"
meta_db="$(jq -r '.meta.database' <<< "$release_values")"
remove_probe() {
  # The official image trusts connections over its own socket (docs/research/postgres-image.md).
  k exec "$meta_pod" -c postgres -- psql -U "$meta_user" -d "$meta_db" -v ON_ERROR_STOP=1 -qAt \
    -c "delete from model_files where path = '${1:-$probe_path}' returning path" | grep -q .
}

# 6. xcube serves the model (T447). With every API replica stopped and Cube
# restarted, Cube still answers the probe cube, asked with a token signed as
# the API signs one (the contract's D1; AC-330's model part). With two API
# replicas, a publish through the Service is in both replicas' field lists at
# once (D2; AC-334). Run between step 5's query and its removal.
b64url() { base64 | tr -d '=\n' | tr '/+' '_-'; }
component_of() {
  k get "$1" -l "app.kubernetes.io/instance=$release,app.kubernetes.io/component=$2" \
    -o jsonpath='{.items[*].metadata.name}'
}
# The API at $1 replicas, each Ready, none older left, and reached through the
# web app again. `rollout status` can answer before a scale from 0 has begun.
scale_api() {
  local api_deploy ready pods
  api_deploy="$(component_of deployments api)"
  if (($1 == api_replicas)); then api_scaled=0; else api_scaled=1; fi
  k scale "deployment/$api_deploy" --replicas="$1" > /dev/null
  for _ in $(seq 1 150); do
    ready="$(k get "deployment/$api_deploy" -o jsonpath='{.status.readyReplicas}')"
    pods="$(component_of pods api | wc -w | tr -d ' ')"
    if [[ "${ready:-0}" == "$1" && "$pods" == "$1" ]]; then
      (($1 == 0)) && return 0
      [[ "$(fetch "$url/api/health")" == 200 ]] && return 0
    fi
    sleep 2
  done
  fail "6. the API didn't come to $1 Ready replicas"
}
xcube_checks() {
  local api_deploy cube_deploy model secret token old answer code cube_count pods pod cookie names
  api_deploy="$(component_of deployments api)"
  cube_deploy="$(component_of deployments cube)"
  model="$(jq -r '.api.xcubeModel' <<< "$release_values")"
  secret="$(k get secret "$(component_of secrets secrets)" -o jsonpath='{.data.cube-api-secret}' | base64 -d)"
  local now header payload signature
  now="$(date +%s)"
  header="$(printf '{"alg":"HS256","typ":"JWT"}' | b64url)"
  payload="$(jq -cn --arg m "$model" --argjson t "$now" '{wechartModel: $m, iat: $t, exp: ($t + 600)}' | b64url)"
  signature="$(printf '%s.%s' "$header" "$payload" | openssl dgst -sha256 -hmac "$secret" -binary | b64url)"
  token="$header.$payload.$signature"

  # D1: no API replica, and a Cube process started after them.
  scale_api 0
  old="$(component_of pods cube)"
  k rollout restart "deployment/$cube_deploy" > /dev/null
  k rollout status "deployment/$cube_deploy" --timeout=10m > /dev/null
  for pod in $old; do k wait --for=delete "pod/$pod" --timeout=120s > /dev/null 2>&1; done
  local query
  query="$(jq -rn --arg m "$probe_cube.count" '{measures: [$m]} | tojson | @uri')"
  for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do
    # From inside Cube's pod: node is there, and Cube's port is not published.
    answer="$(k exec "deployment/$cube_deploy" -c cube -- node -e '
      fetch("http://localhost:4000/cubejs-api/v1/load?query=" + process.argv[1], {
        headers: { authorization: "Bearer " + process.argv[2] },
      }).then(async (r) => console.log(JSON.stringify({ status: r.status, body: await r.text() })));
    ' "$query" "$token" 2> /dev/null)"
    jq -e '.body | contains("Continue wait")' <<< "$answer" > /dev/null 2>&1 || break
    sleep 2
  done
  code="$(jq -r '.status // empty' <<< "$answer" 2> /dev/null)"
  cube_count="$(jq -r --arg m "$probe_cube.count" '.body | fromjson | .data[0][$m] // empty' <<< "$answer" 2> /dev/null)"
  if [[ "$code" == 200 && "$cube_count" =~ ^[0-9]+$ ]] && ((cube_count > 0)); then
    pass "6. with no API replica and Cube restarted, Cube counted $cube_count rows (D1)"
  else
    fail "6. with no API replica, Cube answered: $(head -c 600 <<< "$answer")"
  fi

  # D2: two API replicas, each asked directly.
  scale_api 2
  pods="$(component_of pods api)"
  # The session, with sign-in on: curl's jar, HttpOnly lines included.
  cookie="$(awk -F'\t' 'NF >= 7 && $1 !~ /^# / { print $6 "=" $7 }' "$jar" | paste -sd';' -)"
  replica_meta() {
    k exec "$1" -c api -- node -e '
      fetch("http://localhost:" + process.argv[1] + "/api/meta", { headers: { cookie: process.argv[2] } })
        .then((r) => r.text()).then((t) => console.log(t));
    ' "$(jq -r '.api.port' <<< "$release_values")" "$cookie" 2> /dev/null
  }
  # Each replica's field list cached before the publish.
  for pod in $pods; do replica_meta "$pod" > /dev/null; done
  local replica_path='wechart-verify/replica-probe.yml' replica_cube='wechart_verify_replica'
  local content request
  content="$(printf 'cubes:\n  - name: %s\n    sql_table: %s\n    measures:\n      - name: count\n        type: count\n' \
    "$replica_cube" "$probe_table")"
  request="$(jq -n --arg path "$replica_path" --arg content "$content" '{files: [{path: $path, content: $content}]}')"
  status="$(fetch -X POST -H 'content-type: application/json' --data "$request" "$url/api/model/publish")"
  if [[ "$status" == 200 ]]; then
    for pod in $pods; do
      names="$(replica_meta "$pod" | jq -r '[.cubes[].name] | join(" ")' 2> /dev/null)"
      if [[ " $names " == *" $replica_cube "* ]]; then
        pass "6. $pod lists $replica_cube at once (D2)"
      else
        fail "6. $pod doesn't list $replica_cube after the publish: $names"
      fi
    done
    remove_probe "$replica_path" || fail "6. could not remove $replica_path; delete it in the metadata database"
  else
    fail "6. publishing $replica_path answered $status: $(head -c 600 "$body")"
  fi
  scale_api "$api_replicas"
}

# 7. The query path survives losing one Cube instance and one API replica
# (T423, AC-319). With two of each and a slow query in flight, the Cube pod
# that took the query and the API pod that sent it are deleted. The query is
# asked on as the web app asks it (packages/web/src/query/loadTile.ts): again
# on "Continue wait", and through network errors, 502, 503 and 504 for up to
# 90 s. It returns its data; the signed-in user is never asked to sign in
# again; both Deployments come back to full strength; each keeps a
# PodDisruptionBudget. Run between step 5's query and its removal.
full_strength() {
  local deploy ready want
  deploy="$(component_of deployments "$1")"
  for _ in $(seq 1 ${2:-150}); do
    ready="$(k get "deployment/$deploy" -o jsonpath='{.status.readyReplicas}')"
    want="$(k get "deployment/$deploy" -o jsonpath='{.spec.replicas}')"
    [[ "${ready:-0}" == "$want" && "$(component_of pods "$1" | wc -w | tr -d ' ')" == "$want" ]] && return 0
    sleep 2
  done
  return 1
}
stop_one_checks() {
  local api_deploy cube_deploy want_api want_cube
  api_deploy="$(component_of deployments api)"
  cube_deploy="$(component_of deployments cube)"
  want_api="$(k get "deployment/$api_deploy" -o jsonpath='{.spec.replicas}')"
  want_cube="$(k get "deployment/$cube_deploy" -o jsonpath='{.spec.replicas}')"
  if ((want_api < 2 || want_cube < 2)); then
    fail "7. the query path runs $want_cube Cube instance(s) and $want_api API replica(s), not two of each"
    return
  fi
  full_strength api && full_strength cube || fail '7. the API or Cube was not at full strength to begin with'

  # A query that takes 60 s in the warehouse, on a cube of its own each run,
  # so no cached answer stands in for it: longer than a stopped Cube instance
  # lives on (a 5 s preStop, then up to 16 s of graceful shutdown), so the
  # one that took it can't finish it.
  local slow_path='wechart-verify/slow-probe.yml' slow_cube content request
  slow_cube="wechart_verify_slow_$(date +%s)"
  content="$(printf 'cubes:\n  - name: %s\n    sql: SELECT 1 AS id, pg_sleep(60) AS slept\n    measures:\n      - name: count\n        type: count\n' \
    "$slow_cube")"
  request="$(jq -n --arg path "$slow_path" --arg content "$content" '{files: [{path: $path, content: $content}]}')"
  status="$(fetch -X POST -H 'content-type: application/json' --data "$request" "$url/api/model/publish")"
  if [[ "$status" != 200 ]]; then
    fail "7. publishing $slow_path answered $status: $(head -c 600 "$body")"
    return
  fi

  local me_body who id query since
  me_body="$(mktemp)"
  who() {
    local code
    code="$(curl -sS -o "$me_body" -w '%{http_code}' --max-time 30 -b "$jar" "$url/api/me" 2> /dev/null)" || code=000
    if [[ "$code" == 200 ]]; then jq -r '.name // .email // empty' "$me_body"; else echo "HTTP $code"; fi
  }
  local user
  user="$(who)"
  id="verify-stop-one-$(date +%s)"
  query="$(jq -n --arg m "$slow_cube.count" '{query: {measures: [$m]}}')"
  ask() {
    local code
    # curl writes 000 itself when it gets no answer; nothing is added to it.
    code="$(curl -sS -o "$body" -w '%{http_code}' --max-time 60 -b "$jar" -X POST \
      -H 'content-type: application/json' -H "x-request-id: $id" --data "$query" "$url/api/load" 2> /dev/null)" || code=000
    echo "$code"
  }
  since="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  status="$(ask)"
  if [[ "$status" != 200 ]] || ! jq -e '.error == "Continue wait"' "$body" > /dev/null 2>&1; then
    fail "7. the slow query answered $status before anything was stopped: $(head -c 300 "$body")"
    remove_probe "$slow_path" || true
    rm -f "$me_body"
    return
  fi

  # The Cube pod that took it, by its log of the request, and the API pod
  # that sent it, by the address that log gives.
  local pod cube_pod='' api_ip='' api_pod=''
  for pod in $(component_of pods cube); do
    api_ip="$(k logs "$pod" -c cube --since-time="$since" 2> /dev/null | grep '^{' |
      jq -r 'select(.message == "REST API Request" and (.path | endswith("/v1/load"))) | .ip' 2> /dev/null |
      tail -1 | sed 's/^::ffff://')"
    if [[ -n "$api_ip" ]]; then
      cube_pod="$pod"
      break
    fi
  done
  for pod in $(component_of pods api); do
    [[ "$(k get "pod/$pod" -o jsonpath='{.status.podIP}')" == "$api_ip" ]] && api_pod="$pod"
  done
  if [[ -z "$cube_pod" || -z "$api_pod" ]]; then
    # Then the one stopped may not be the one running it: not the stop asked for.
    fail "7. could not tell from Cube's log which Cube pod took the query (${cube_pod:-none}) or which API pod sent it (${api_pod:-none}); stopping the first of each"
    cube_pod="${cube_pod:-$(component_of pods cube | awk '{print $1}')}"
    api_pod="${api_pod:-$(component_of pods api | awk '{print $1}')}"
  fi
  k delete pod "$cube_pod" "$api_pod" --wait=false > /dev/null
  echo "      stopped $cube_pod and $api_pod with the query in flight"

  local asked_again=0 someone_else='' outage_since='' polls=0 answered='' seen='' stopped_at=$SECONDS statuses=''
  while ((polls < 240)); do
    polls=$((polls + 1))
    status="$(ask)"
    [[ " $statuses " == *" $status "* ]] || statuses="$statuses $status"
    case "$status" in
      200)
        outage_since=''
        if jq -e '.error == "Continue wait"' "$body" > /dev/null 2>&1; then
          sleep 0.5
        else
          answered=1
          break
        fi
        ;;
      000 | 502 | 503 | 504)
        outage_since="${outage_since:-$SECONDS}"
        ((SECONDS - outage_since >= 90)) && break
        sleep 1
        ;;
      *) break ;;
    esac
    # The web app sends its user to sign in on a 401 (AuthGate.tsx), and on
    # nothing else; any other name is someone else's session.
    seen="$(who)"
    [[ "$seen" == 'HTTP 401' ]] && asked_again=1
    [[ "$seen" != HTTP* && "$seen" != "$user" ]] && someone_else="$seen"
  done
  local count elapsed=$((SECONDS - stopped_at))
  count="$(jq -r --arg m "$slow_cube.count" '.data[0][$m] // empty' "$body" 2> /dev/null)"
  if [[ -n "$answered" && "$count" == 1 ]]; then
    pass "7. with $cube_pod and $api_pod stopped mid-query, the query returned its data $elapsed s later, after $polls asks (answers:$statuses)"
  else
    fail "7. after $polls asks the query answered $status: $(head -c 300 "$body")"
  fi
  # Ran again elsewhere: the stopped instance couldn't have answered in under
  # a minute from the stop. Let go within the 5 s heartbeat's stall of about
  # 20 s, where Cube's default 30 s took two minutes before it ran again
  # (research cube/ha-topology.md §1).
  if [[ -n "$answered" ]] && ((elapsed >= 60 && elapsed <= 150)); then
    pass "7. the query ran again on the other instance, let go within the queue heartbeat's stall ($elapsed s)"
  elif [[ -n "$answered" ]]; then
    fail "7. the answer came $elapsed s after the stop: under 60 s, the stopped instance ran it; over 150 s, the heartbeat didn't let it go"
  fi
  if [[ "$security" == true ]]; then
    seen="$(who)"
    if ((asked_again)) || [[ -n "$someone_else" || "$seen" != "$user" ]]; then
      fail "7. the signed-in user was not kept: /api/me was '$user', then '$seen'$( ((asked_again)) && echo ', and 401 on the way')${someone_else:+, and '$someone_else' on the way}"
    else
      pass "7. /api/me named '$user' at every answer, never asking to sign in again"
    fi
  fi
  if full_strength api && full_strength cube; then
    pass "7. the API and Cube are back to $want_api and $want_cube Ready replicas"
  else
    fail '7. the API or Cube did not come back to full strength'
  fi
  local component allowed
  for component in api cube; do
    allowed="$(k get poddisruptionbudgets -l "app.kubernetes.io/instance=$release,app.kubernetes.io/component=$component" \
      -o jsonpath='{.items[0].status.disruptionsAllowed}' 2> /dev/null)"
    if [[ "${allowed:-0}" =~ ^[0-9]+$ ]] && ((allowed >= 1)); then
      pass "7. $component's PodDisruptionBudget allows $allowed disruption(s)"
    else
      fail "7. $component has no PodDisruptionBudget allowing a disruption"
    fi
  done
  remove_probe "$slow_path" || fail "7. could not remove $slow_path; delete it in the metadata database"
  rm -f "$me_body"
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
      xcube_checks
      stop_one_checks
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
