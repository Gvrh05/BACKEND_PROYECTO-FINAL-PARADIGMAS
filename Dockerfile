FROM node:22-alpine AS base
WORKDIR /usr/src/app
RUN npm install --global pnpm@10.19.0

# -------------------------------------------------------------
# Dependencies Stage
# -------------------------------------------------------------
FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# -------------------------------------------------------------
# Build Stage
# -------------------------------------------------------------
FROM dependencies AS build
COPY . .
RUN pnpm run build
RUN pnpm prune --prod

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
COPY --chown=node:node public/seeds ./public/seeds
RUN mkdir -p /app/uploads/questions && chown -R node:node /app/uploads /app/public
USER node

EXPOSE 3000

CMD ["sh", "-c", "pnpm run migration:run:prod && node dist/main.js"]
