FROM node:24-slim AS base
RUN corepack enable && corepack prepare pnpm@latest-10 --activate
WORKDIR /app

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

RUN mkdir -p /app /data && chown node:node /app /data
WORKDIR /app
USER node

COPY --chown=node:node package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY --chown=node:node packages/server/package.json packages/server/
COPY --chown=node:node packages/client/package.json packages/client/
RUN pnpm install --frozen-lockfile --prod

COPY --chown=node:node --from=build-server /app/packages/server/dist ./packages/server/dist
COPY --chown=node:node --from=build-server /app/packages/server/migrations ./packages/server/migrations
COPY --chown=node:node --from=build-client /app/packages/client/dist ./packages/client/dist

ENV NODE_ENV=production
ENV PORT=6883
ENV DATABASE_PATH=/data/weekboodschappen.db

EXPOSE ${PORT}
VOLUME ["/data"]

CMD ["node", "packages/server/dist/index.js"]
