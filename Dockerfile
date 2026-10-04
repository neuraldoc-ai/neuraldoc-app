# neuraldoc app: interface, API and MCP server in one container.
#
# Build:  docker build -t neuraldoc .
# Run:    docker run -p 8080:8080 -v neuraldoc-data:/data neuraldoc
# Keys:   docker run -p 8080:8080 --env-file .env -v neuraldoc-data:/data neuraldoc
#         Own projects are uploaded in the browser: folder, ZIP or GitHub URL.
# Logs:   docker logs -f <container>   (start, configuration, imports, checks, errors)
#
# Clone with --recursive: the MOBIQ showcase comes from the submodules in datasets/.
# Keys are passed at runtime (--env-file) and never baked into the image.

# The interface is built once on the build machine; the result is the same on every platform.
FROM --platform=$BUILDPLATFORM node:24-alpine AS build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
COPY mcp/ /app/mcp/
# MOBIQ example (git submodules): eval data, docs and database. The code repository is only needed for brain:index.
COPY datasets/mobiq/data/ /app/datasets/mobiq/data/
COPY datasets/mobiq-docs/ /app/datasets/mobiq-docs/
COPY datasets/mobiq-db/ /app/datasets/mobiq-db/
ARG VITE_LANDING_URL=http://localhost:5173/
ENV VITE_LANDING_URL=$VITE_LANDING_URL
RUN npm run build

FROM node:24-alpine
LABEL org.opencontainers.image.title="neuraldoc-app" \
      org.opencontainers.image.description="neuraldoc: find outdated documentation after a code change and draft evidence-backed updates" \
      org.opencontainers.image.source="https://github.com/neuraldoc-ai/neuraldoc-app" \
      org.opencontainers.image.licenses="MIT"
# Git clones repositories given by URL in the import dialog.
RUN apk add --no-cache git
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
WORKDIR /app
COPY --from=build /app/frontend/dist ./frontend/dist
# The server shares the data contract and showcase fixtures with the UI.
COPY frontend/src/dashboard/features/docs/ ./frontend/src/dashboard/features/docs/
COPY frontend/server-deps.mjs ./frontend/
COPY mcp/ ./mcp/
COPY datasets/mobiq/data/ ./datasets/mobiq/data/
COPY datasets/mobiq-docs/ ./datasets/mobiq-docs/
COPY datasets/mobiq-db/ ./datasets/mobiq-db/
# Projects, decisions and caches survive restarts in this volume.
RUN mkdir -p /data && chown node:node /data
ENV PORT=8080 NEURALDOC_APP_URL=http://localhost:8080 NEURALDOC_STATE_DIR=/data
VOLUME /data
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD wget -qO- http://127.0.0.1:8080/health/live || exit 1
CMD ["node", "--use-system-ca", "mcp/serve.mjs"]
