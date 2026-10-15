# syntax=docker/dockerfile:1
# Build context MUST be the monorepo root, e.g.:
#   docker build -f services/orders/Dockerfile -t dropwire-orders .
FROM node:22-alpine AS base
WORKDIR /repo
RUN corepack enable

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY services/orders/package.json services/orders/package.json
RUN pnpm install --frozen-lockfile --filter orders...

FROM deps AS build
COPY tsconfig.base.json ./
COPY services/orders services/orders
RUN pnpm --filter orders run prisma:generate
RUN pnpm --filter orders run build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /repo/services/orders/dist /repo/services/orders/dist
COPY --from=build /repo/services/orders/generated /repo/services/orders/generated
COPY --from=build /repo/services/orders/node_modules /repo/services/orders/node_modules
COPY --from=build /repo/services/orders/package.json /repo/services/orders/package.json
WORKDIR /repo/services/orders
EXPOSE 3003
CMD ["node", "dist/main.js"]
