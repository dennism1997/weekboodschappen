FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN pnpm install --frozen-lockfile

# Build
FROM deps AS build
COPY packages/server/ packages/server/
COPY packages/client/ packages/client/
RUN pnpm --filter @weekboodschappen/client build
RUN pnpm --filter @weekboodschappen/server build

# Production
FROM base AS production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/server/node_modules ./packages/server/node_modules
COPY --from=build /app/packages/server/dist ./packages/server/dist
COPY --from=build /app/packages/server/migrations ./packages/server/migrations
COPY --from=build /app/packages/server/package.json ./packages/server/
COPY --from=build /app/packages/client/dist ./packages/client/dist
COPY package.json pnpm-workspace.yaml ./

ENV NODE_ENV=production
ENV PORT=3001
ENV DATABASE_PATH=/data/weekboodschappen.db

EXPOSE 3001

VOLUME ["/data"]

CMD ["node", "packages/server/dist/index.js"]
