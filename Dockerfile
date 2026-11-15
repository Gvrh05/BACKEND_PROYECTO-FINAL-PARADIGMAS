FROM node:22-alpine AS base
WORKDIR /usr/src/app
RUN npm install --global pnpm@11.11.0

# -------------------------------------------------------------
# Dependencies Stage
# -------------------------------------------------------------
FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,target=/pnpm/store pnpm install --frozen-lockfile --store-dir=/pnpm/store --network-concurrency=4 --fetch-timeout=120000 --fetch-retries=3

# -------------------------------------------------------------
# Build Stage
# -------------------------------------------------------------
FROM dependencies AS build
COPY . .
RUN pnpm run build
RUN --mount=type=cache,target=/pnpm/store CI=true pnpm install --prod --offline --frozen-lockfile --store-dir=/pnpm/store

# -------------------------------------------------------------
# Production Stage
# -------------------------------------------------------------
FROM base AS production
ENV NODE_ENV=production
WORKDIR /app

COPY --chown=node:node package.json pnpm-lock.yaml ./
COPY --from=build --chown=node:node /usr/src/app/node_modules ./node_modules
COPY --from=build --chown=node:node /usr/src/app/dist ./dist
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node docs/openapi.json docs/index.html ./docs/
COPY --chown=node:node public/seeds ./public/seeds
RUN mkdir -p /app/uploads/questions && chown -R node:node /app/uploads /app/public
USER node

EXPOSE 3000

CMD ["sh", "-c", "node node_modules/typeorm/cli.js migration:run -d dist/shared/database/data-source.js && node dist/main.js"]
