# syntax=docker/dockerfile:1
# Build context MUST be the monorepo root, e.g.:
#   docker build -f services/catalog/Dockerfile -t dropwire-catalog .
FROM node:22-alpine AS base
WORKDIR /repo
RUN corepack enable

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY services/catalog/package.json services/catalog/package.json
COPY services/catalog/prisma services/catalog/prisma
RUN pnpm install --frozen-lockfile --filter catalog...

FROM deps AS build
COPY tsconfig.base.json ./
COPY services/catalog services/catalog
RUN pnpm --filter catalog run prisma:generate
RUN pnpm --filter catalog run build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /repo/services/catalog/dist /repo/services/catalog/dist
COPY --from=build /repo/services/catalog/generated /repo/services/catalog/generated
COPY --from=build /repo/services/catalog/node_modules /repo/services/catalog/node_modules
COPY --from=build /repo/services/catalog/package.json /repo/services/catalog/package.json
WORKDIR /repo/services/catalog
EXPOSE 3001
CMD ["node", "dist/main.js"]
