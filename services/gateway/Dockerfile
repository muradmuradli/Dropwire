# syntax=docker/dockerfile:1
# Build context MUST be the monorepo root, e.g.:
#   docker build -f services/gateway/Dockerfile -t dropwire-gateway .
FROM node:22-alpine AS base
WORKDIR /repo
RUN corepack enable

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY services/gateway/package.json services/gateway/package.json
RUN pnpm install --frozen-lockfile --filter gateway...

FROM deps AS build
COPY tsconfig.base.json ./
COPY services/gateway services/gateway
RUN pnpm --filter gateway run build

FROM base AS runtime
ENV NODE_ENV=production
# pnpm's node_modules are symlinks into this root-level store — without it, every
# symlink below is dangling and nothing resolves at runtime.
COPY --from=build /repo/node_modules /repo/node_modules
COPY --from=build /repo/services/gateway/dist /repo/services/gateway/dist
COPY --from=build /repo/services/gateway/node_modules /repo/services/gateway/node_modules
COPY --from=build /repo/services/gateway/package.json /repo/services/gateway/package.json
WORKDIR /repo/services/gateway
EXPOSE 3000
CMD ["node", "dist/main.js"]
