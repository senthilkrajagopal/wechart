#!/usr/bin/env bash
#
# T702 (R71 9: no migration; AC-328, AC-310, AC-421, AC-424): the compose
# stack's fresh start onto xcube's R71 image, `256d632371`.
#
# That image's schema 14 has no migration from folder-prefixed names, and it
# refuses to start on a schema holding any (research
# docs/research/xcube-256d632371.md, "Old schemas", 6.2). So everything built
# under per-folder names is dropped, and each environment seeds itself again
# when its API next starts:
#
#   1. Cube's API instance, its refresh worker and Cube Store are stopped, so
#      nothing reads or builds while it goes.
#   2. wechart's metadata, every environment's, is dropped, on the
#      `wechart-meta` server:
#        - `wechart_meta`: development and the phase-1 e2e suite (which resets
#          its data at each run, model `e2e`), and xcube's schema `xcube`, with
#          every model in it (`demo`, `e2e`, `e2e-security`);
#        - `wechart_test`: the API's unit suite (its global setup makes it);
#        - `wechart_security`: the security suite, model `e2e-security` (its
#          `prepare-stack.mjs` makes it).
#      `wechart_meta` is made again, empty.
#   3. Pre-aggregation schemas in the warehouse (`sample-db`), where a rollup
#      that isn't external builds: `<schema>_<model>_<hash>`, `<schema>` being
#      `prod_pre_aggregations` here (6.3; none is expected, since the seeded
#      models' rollups are all external).
#   4. Cube Store's data: its volume, where every external rollup lives (6.3).
#   5. xcube's role and schema bootstrapped again (`xcube-db-init`), and Cube
#      Store, Cube and its worker started on the R71 image, which migrates the
#      empty schema to 14.
#
# Nothing is seeded here: each API seeds its own database and pushes its model
# when it starts (`WECHART_SEED=1`, the e2e suites' own set-up).
#
# Run it only with every wechart API stopped (development, and both e2e
# suites' servers), holding the API-test and e2e locks. It asks for `--yes`.
#
#   COMPOSE_PROJECT_NAME=wechart COMPOSE_FILE=<repo>/docker-compose.yml \
#     infra/xcube/fresh-start.sh --yes
#
# `CUBE_IMAGE` defaults to the R71 image, so it holds whichever compose file is
# named. Export the same value for any later `docker compose up` until that
# file pins it.

set -euo pipefail

# T740: `2e611eae61`, R71's image with R38's rollup names kept; schema 14 still
# (docs/research/xcube-2e611eae61.md). T765: `c2602ac72a`, the same with its
# folder tree to read, for a start's catch-up (docs/research/xcube-c2602ac72a.md).
# T690: `407622a6b8`, the same with `rollupOnly` on GET …/revision
# (docs/research/xcube-407622a6b8.md). T811, T806: `bb188d8ada`, the same with
# the SQL runner's bound values and the catalog's foreign keys
# (docs/research/xcube-bb188d8ada.md).
R71_IMAGE='ghcr.io/senthilkrajagopal/xcube:v1.7.45-bb188d8ada@sha256:96024be5ca88d227ff456a0d832642e9a42a27c6a7d55187520a00d84389f63f'
REVISION='bb188d8ada78264145ff3e018bc2f9b043554721'

if [[ "${1:-}" != '--yes' ]]; then
  sed -n '2,41p' "$0" | sed 's/^# \{0,1\}//'
  echo
  echo 'This drops every wechart database and xcube schema in the compose stack. Run it with --yes.' >&2
  exit 2
fi
: "${COMPOSE_PROJECT_NAME:?set COMPOSE_PROJECT_NAME (wechart)}"
: "${COMPOSE_FILE:?set COMPOSE_FILE to the repository’s docker-compose.yml}"
export CUBE_IMAGE="${CUBE_IMAGE:-$R71_IMAGE}"

say() { printf '\n== %s\n' "$*"; }
meta() { docker exec -i wechart-meta psql -U wechart -d postgres -v ON_ERROR_STOP=1 -Atc "$1"; }
warehouse() { docker exec -i wechart-sample-db psql -U sample -d sample -v ON_ERROR_STOP=1 -Atc "$1"; }

say "1. Stopping Cube, its refresh worker and Cube Store"
docker compose stop cube cube-refresh-worker cubestore

say "2. Dropping wechart's databases, and xcube's schema with wechart_meta"
docker compose up -d --wait wechart-meta sample-db
for database in wechart_test wechart_security wechart_meta; do
  meta "DROP DATABASE IF EXISTS ${database} WITH (FORCE)"
done
meta 'CREATE DATABASE wechart_meta OWNER wechart'

say "3. Dropping pre-aggregation schemas in the warehouse"
schemas="$(warehouse "SELECT nspname FROM pg_namespace WHERE nspname LIKE '%pre\\_aggregations%' ORDER BY 1")"
if [[ -z "$schemas" ]]; then
  echo 'none'
else
  while IFS= read -r schema; do
    echo "dropping ${schema}"
    warehouse "DROP SCHEMA \"${schema}\" CASCADE"
  done <<<"$schemas"
fi

say "4. Removing Cube Store's data"
docker compose rm -f -s cubestore
volume="${COMPOSE_PROJECT_NAME}_wechart-cubestore-data"
if docker volume inspect "$volume" >/dev/null 2>&1; then
  docker volume rm "$volume"
else
  echo "no volume ${volume}"
fi

say "5. Bootstrapping xcube's schema again, and starting Cube on ${CUBE_IMAGE}"
docker compose up -d --force-recreate xcube-db-init
status="$(docker wait wechart-xcube-db-init)"
if [[ "$status" != 0 ]]; then
  docker logs wechart-xcube-db-init >&2
  echo "xcube-db-init exited ${status}" >&2
  exit 1
fi
docker compose up -d --force-recreate --no-deps cubestore cube cube-refresh-worker

for container in wechart-cube wechart-cube-refresh-worker; do
  image="$(docker inspect --format '{{.Config.Image}}' "$container")"
  revision="$(docker inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$container")"
  echo "${container}: ${image} (${revision})"
  if [[ "$image" != "$CUBE_IMAGE" || "$revision" != "$REVISION" ]]; then
    echo "${container} doesn't run the R71 image" >&2
    exit 1
  fi
done

printf 'Waiting for Cube'
for _ in $(seq 1 150); do
  if curl -fsS http://localhost:54000/readyz >/dev/null 2>&1; then
    echo ' ready'
    version="$(docker exec -i wechart-meta psql -U wechart -d wechart_meta -Atc 'SELECT max(version) FROM xcube.schema_migrations' 2>/dev/null || true)"
    echo "xcube's schema version: ${version:-unknown}"
    say "Done. Start each API to seed its database and push its model."
    exit 0
  fi
  printf '.'
  sleep 2
done
echo
docker logs --tail 50 wechart-cube >&2
echo "Cube didn't become ready" >&2
exit 1
