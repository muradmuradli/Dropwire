# syntax=docker/dockerfile:1
# Build context MUST be the monorepo root, e.g.:
#   docker build -f services/orders/Dockerfile -t dropwire-orders .
FROM node:22-alpine AS base
WORKDIR /repo
RUN corepack enable

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY services/orders/package.json services/orders/package.json
COPY services/orders/prisma services/orders/prisma
RUN pnpm install --frozen-lockfile --filter orders...

FROM deps AS build
COPY tsconfig.base.json ./
COPY scripts scripts
COPY contracts contracts
COPY services/orders services/orders
RUN node scripts/gen-contracts.js proto
RUN pnpm --filter orders run prisma:generate
RUN pnpm --filter orders run build

FROM base AS runtime
ENV NODE_ENV=production
# pnpm's node_modules are symlinks into this root-level store — without it, every
# symlink below is dangling and nothing resolves at runtime.
COPY --from=build /repo/node_modules /repo/node_modules
COPY --from=build /repo/services/orders/dist /repo/services/orders/dist
COPY --from=build /repo/services/orders/generated /repo/services/orders/generated
COPY --from=build /repo/services/orders/node_modules /repo/services/orders/node_modules
COPY --from=build /repo/services/orders/package.json /repo/services/orders/package.json
COPY --from=build /repo/contracts/proto/dropwire/inventory/v1/inventory.proto /repo/contracts/proto/dropwire/inventory/v1/inventory.proto
WORKDIR /repo/services/orders
EXPOSE 3003
CMD ["node", "dist/main.js"]
