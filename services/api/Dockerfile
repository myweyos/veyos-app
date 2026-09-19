# Weyos API. Build context is the REPO ROOT (the API compiles workspace packages from source):
#   docker build -f services/api/Dockerfile -t weyos-api .
#
# Region is deploy-time configuration (SCRUM-25): one image, deployed per region with its own
# DATABASE_URL / REDIS_URL / ENGINE_URL. Nothing in the image knows which region it is.

FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared-schema/package.json packages/shared-schema/
COPY packages/app-state/package.json packages/app-state/
COPY packages/phenotype/package.json packages/phenotype/
COPY packages/test-fixtures/package.json packages/test-fixtures/
COPY services/api/package.json services/api/
COPY apps/mobile/package.json apps/mobile/
RUN npm ci --ignore-scripts
COPY packages ./packages
COPY services/api ./services/api
# One self-contained bundle (nest-cli.bundle.json): workspace source compiled in, node_modules external.
RUN npm run build:bundle -w @weyos/api

FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared-schema/package.json packages/shared-schema/
COPY packages/app-state/package.json packages/app-state/
COPY packages/phenotype/package.json packages/phenotype/
COPY packages/test-fixtures/package.json packages/test-fixtures/
COPY services/api/package.json services/api/
COPY apps/mobile/package.json apps/mobile/
RUN npm ci --ignore-scripts --omit=dev -w @weyos/api && npm cache clean --force
# The API validates every payload against the published schemas at runtime (SchemaRegistry
# finds them by walking up to packages/shared-schema/schemas).
COPY packages/shared-schema/schemas ./packages/shared-schema/schemas
COPY --from=build /app/services/api/dist ./services/api/dist
USER node
ENV PORT=3000
EXPOSE 3000
CMD ["node", "services/api/dist/main.js"]
