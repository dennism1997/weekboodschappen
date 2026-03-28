FROM node:24-slim AS base
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
WORKDIR /app

# Install system dependencies for better-sqlite3 and playwright
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN pnpm install --frozen-lockfile

# Build client
FROM deps AS build-client
COPY packages/client/ packages/client/
RUN pnpm --filter @weekboodschappen/client build

# Build server
FROM deps AS build-server
COPY packages/server/ packages/server/
RUN pnpm --filter @weekboodschappen/server build

# Production
FROM node:24-slim AS production
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN pnpm install --frozen-lockfile --prod

# Install Playwright Chromium and its system dependencies
RUN pnpm --filter @weekboodschappen/server exec playwright install --with-deps chromium

COPY --from=build-server /app/packages/server/dist ./packages/server/dist
COPY --from=build-server /app/packages/server/migrations ./packages/server/migrations
COPY --from=build-client /app/packages/client/dist ./packages/client/dist

ENV NODE_ENV=production
ENV PORT=6883
ENV DATABASE_PATH=/data/weekboodschappen.db

EXPOSE 6883

RUN mkdir -p /data && chown -R node:node /app /data
VOLUME ["/data"]

USER node

CMD ["node", "packages/server/dist/index.js"]
