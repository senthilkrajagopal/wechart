# syntax=docker/dockerfile:1
#
# wechart's two images, built from the repository root (docs/deploy.md):
#
#   docker build -f deploy/Dockerfile --target api -t wechart-api:<tag> .
#   docker build -f deploy/Dockerfile --target web -t wechart-web:<tag> .
#
# One build stage installs the workspace once from the lockfile and builds
# both packages (docs/research/node-docker-pnpm.md).

FROM node:26.10.0-trixie-slim@sha256:ec7758ee051e457b468b32bde57b0879010b325bb9862718e9615225ce4aaae1 AS build
# The node image has no Corepack from Node 25 on; pnpm must be exactly the
# version package.json names, or pnpm fetches that one itself (pmOnFail).
RUN npm install -g pnpm@12.5.1 \
 && test "$(pnpm --version)" = "12.5.1"
# The store the cache mount below holds: $PNPM_HOME/store.
ENV PNPM_HOME=/pnpm
WORKDIR /src
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile
RUN pnpm --filter @wechart/api build \
 && pnpm --filter @wechart/web build
# The API with its production dependencies only, and the files its package
# names: dist/ and the migrations it runs as it starts.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm --filter @wechart/api --prod deploy /app
# The directory the API seeds the model from: empty, so the model starts
# empty (docs/deploy.md, "The model").
RUN test -f /app/dist/main.js \
 && ls /app/src/db/migrations/*.cjs > /dev/null \
 && mkdir /app/model-seed

# wechart's API (packages/api).
FROM node:26.10.0-trixie-slim@sha256:ec7758ee051e457b468b32bde57b0879010b325bb9862718e9615225ce4aaae1 AS api
# An init as PID 1: signals reach node, and exited children are reaped.
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV WECHART_MODEL_DIR=/app/model-seed
WORKDIR /app
COPY --from=build /app /app
# The image's node user, numerically, so runAsNonRoot can check it.
USER 1000:1000
EXPOSE 4100
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]

# The web app (packages/web), served by nginx as uid 101 on port 8080. Its
# server configuration, with /api passed to the API, comes from the chart.
FROM nginxinc/nginx-unprivileged:1.30.5-alpine-slim@sha256:307ca0bded4dda86dade6f5bd2a2551601bec9bac3fd73a21613fabcd9eca66a AS web
COPY --from=build /src/packages/web/dist/ /usr/share/nginx/html/
