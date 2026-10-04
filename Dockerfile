FROM node:24-alpine AS build
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
# The project import reads local Git repositories and parses them at runtime.
# Mounted repositories belong to the host user; the import only reads them.
RUN apk add --no-cache git && git config --system safe.directory '*'
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
WORKDIR /app
COPY --from=build /app/frontend/dist ./frontend/dist
# The server shares the data contract and showcase fixtures with the UI.
COPY frontend/src/dashboard/features/docs/ ./frontend/src/dashboard/features/docs/
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
CMD ["node", "--use-system-ca", "mcp/serve.mjs"]
