# syntax=docker/dockerfile:1
# Build context MUST be the monorepo root, e.g.:
#   docker build -f services/inventory/Dockerfile -t dropwire-inventory .
FROM node:22-alpine AS base
WORKDIR /repo
RUN corepack enable

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY services/inventory/package.json services/inventory/package.json
COPY services/inventory/prisma services/inventory/prisma
RUN pnpm install --frozen-lockfile --filter inventory...

FROM deps AS build
COPY tsconfig.base.json ./
COPY scripts scripts
COPY contracts contracts
COPY services/inventory services/inventory
RUN node scripts/gen-contracts.js proto
RUN pnpm --filter inventory run prisma:generate
RUN pnpm --filter inventory run build

FROM base AS runtime
ENV NODE_ENV=production
# pnpm's node_modules are symlinks into this root-level store — without it, every
# symlink below is dangling and nothing resolves at runtime.
COPY --from=build /repo/node_modules /repo/node_modules
COPY --from=build /repo/services/inventory/dist /repo/services/inventory/dist
COPY --from=build /repo/services/inventory/generated /repo/services/inventory/generated
COPY --from=build /repo/services/inventory/node_modules /repo/services/inventory/node_modules
COPY --from=build /repo/services/inventory/package.json /repo/services/inventory/package.json
COPY --from=build /repo/contracts/proto/dropwire/inventory/v1/inventory.proto /repo/contracts/proto/dropwire/inventory/v1/inventory.proto
WORKDIR /repo/services/inventory
EXPOSE 3002 4002
CMD ["node", "dist/main.js"]
