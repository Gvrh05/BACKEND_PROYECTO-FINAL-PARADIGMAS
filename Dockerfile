# -------------------------------------------------------------
# Base Stage: Node.js Alpine
# -------------------------------------------------------------
FROM node:20-alpine AS base
WORKDIR /usr/src/app

# -------------------------------------------------------------
# Dependencies Stage
# -------------------------------------------------------------
FROM base AS dependencies
COPY package*.json ./
RUN npm ci

# -------------------------------------------------------------
# Build Stage
# -------------------------------------------------------------
FROM dependencies AS build
COPY . .
RUN npm run build
RUN npm prune --production

# -------------------------------------------------------------
# Production Stage
# -------------------------------------------------------------
FROM base AS production
ENV NODE_ENV=production

COPY package*.json ./
COPY --from=dependencies /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist ./dist
COPY --from=build /usr/src/app/public ./public

EXPOSE 3000

CMD ["node", "dist/main.js"]
