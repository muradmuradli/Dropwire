# syntax=docker/dockerfile:1
# Build context MUST be the monorepo root, e.g.:
#   docker build -f services/notifications/Dockerfile -t dropwire-notifications .
FROM node:22-alpine AS base
WORKDIR /repo
RUN corepack enable

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY services/notifications/package.json services/notifications/package.json
RUN pnpm install --frozen-lockfile --filter notifications...

FROM deps AS build
COPY tsconfig.base.json ./
COPY services/notifications services/notifications
RUN pnpm --filter notifications run build

FROM base AS runtime
ENV NODE_ENV=production
# pnpm's node_modules are symlinks into this root-level store — without it, every
# symlink below is dangling and nothing resolves at runtime.
COPY --from=build /repo/node_modules /repo/node_modules
COPY --from=build /repo/services/notifications/dist /repo/services/notifications/dist
COPY --from=build /repo/services/notifications/node_modules /repo/services/notifications/node_modules
COPY --from=build /repo/services/notifications/package.json /repo/services/notifications/package.json
WORKDIR /repo/services/notifications
EXPOSE 3005
CMD ["node", "dist/main.js"]
