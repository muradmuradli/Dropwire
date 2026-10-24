# syntax=docker/dockerfile:1
# Build context MUST be the monorepo root, e.g.:
#   docker build -f services/payments/Dockerfile -t dropwire-payments .
FROM node:22-alpine AS base
WORKDIR /repo
RUN corepack enable

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY services/payments/package.json services/payments/package.json
COPY services/payments/prisma services/payments/prisma
RUN pnpm install --frozen-lockfile --filter payments...

FROM deps AS build
COPY tsconfig.base.json ./
COPY scripts scripts
COPY contracts contracts
COPY services/payments services/payments
RUN node scripts/gen-contracts.js events
RUN pnpm --filter payments run prisma:generate
RUN pnpm --filter payments run build

FROM base AS runtime
ENV NODE_ENV=production
# pnpm's node_modules are symlinks into this root-level store — without it, every
# symlink below is dangling and nothing resolves at runtime.
COPY --from=build /repo/node_modules /repo/node_modules
COPY --from=build /repo/services/payments/dist /repo/services/payments/dist
COPY --from=build /repo/services/payments/generated /repo/services/payments/generated
COPY --from=build /repo/services/payments/node_modules /repo/services/payments/node_modules
COPY --from=build /repo/services/payments/package.json /repo/services/payments/package.json
WORKDIR /repo/services/payments
EXPOSE 3004
CMD ["node", "dist/main.js"]
