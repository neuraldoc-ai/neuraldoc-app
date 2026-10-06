# neuraldoc app: interface, API and MCP server in one container.
#
# Build:  docker build -t neuraldoc .
# Run:    docker run -p 8080:8080 -v neuraldoc-data:/data neuraldoc
# Keys:   in the app under Einstellungen (stored in /data), or --env-file .env
#         Own projects are uploaded in the browser: folder, ZIP or GitHub URL.
#         The MOBIQ example project is loaded from GitHub with one click on the start page.
# Logs:   docker logs -f <container>   (start, configuration, imports, checks, errors)
#
# The app image contains no sample data. The prepared MOBIQ showcase (no keys, no model calls) is a
# separate target that needs the dataset submodules (git clone --recursive):
#         docker build --target showcase -t neuraldoc-showcase .
# Keys are passed at runtime and never baked into the image.

# The interface is built once on the build machine; the result is the same on every platform.
FROM --platform=$BUILDPLATFORM node:24-alpine AS deps
WORKDIR /app/frontend
RUN corepack enable
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend/ ./
COPY mcp/ /app/mcp/
ARG VITE_LANDING_URL=
ENV VITE_LANDING_URL=$VITE_LANDING_URL

# Without datasets/ the showcase parts are built from an empty stand-in (see vite.config.ts).
# Type checking needs the submodules and runs in CI.
FROM deps AS build
RUN pnpm run build:app

FROM deps AS build-showcase
# MOBIQ example (git submodules): eval data, docs and database. The code repository is only needed for brain:index.
COPY datasets/mobiq/data/ /app/datasets/mobiq/data/
COPY datasets/mobiq-docs/ /app/datasets/mobiq-docs/
COPY datasets/mobiq-db/ /app/datasets/mobiq-db/
RUN pnpm run build

FROM node:24-alpine AS runtime
LABEL org.opencontainers.image.title="neuraldoc-app" \
      org.opencontainers.image.description="neuraldoc: find outdated documentation after a code change and draft evidence-backed updates" \
      org.opencontainers.image.source="https://github.com/neuraldoc-ai/neuraldoc-app" \
      org.opencontainers.image.licenses="MIT"
# Git clones repositories given by URL in the import dialog.
RUN apk add --no-cache git
WORKDIR /app/frontend
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN corepack enable && pnpm install --prod --frozen-lockfile && pnpm store prune && rm -rf /root/.cache /root/.local/share/pnpm
WORKDIR /app
# The server shares import rules and vocabulary with the UI.
COPY frontend/src/dashboard/features/docs/import-rules.mjs frontend/src/dashboard/features/docs/vocabulary.ts ./frontend/src/dashboard/features/docs/
COPY frontend/server-deps.mjs ./frontend/
COPY mcp/ ./mcp/
# Projects, decisions, keys and caches survive restarts in this volume.
RUN mkdir -p /data && chown node:node /data
ENV PORT=8080 NEURALDOC_APP_URL=http://localhost:8080 NEURALDOC_STATE_DIR=/data
VOLUME /data
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD wget -qO- http://127.0.0.1:8080/health/live || exit 1
CMD ["node", "--use-system-ca", "mcp/serve.mjs"]

# The prepared MOBIQ showcase: sample data only, no import, no model calls.
FROM runtime AS showcase
COPY --from=build-showcase /app/frontend/dist ./frontend/dist
COPY frontend/src/dashboard/features/docs/ ./frontend/src/dashboard/features/docs/
COPY datasets/mobiq/data/ ./datasets/mobiq/data/
COPY datasets/mobiq-docs/ ./datasets/mobiq-docs/
COPY datasets/mobiq-db/ ./datasets/mobiq-db/
ENV NEURALDOC_MODE=showcase

# Default target: the app people run, empty until they import a project.
FROM runtime AS app
COPY --from=build /app/frontend/dist ./frontend/dist
