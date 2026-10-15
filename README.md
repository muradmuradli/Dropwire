# Dropwire

A flash-sale / limited-drop e-commerce platform, built as a portfolio project. The goal: never
oversell stock even when thousands of users try to buy at once, and recover cleanly when a
dependency fails.

New to this stack (microservices, gRPC, Kafka, sagas)? Start with `notes/LEARNING.md` — it explains
every concept here in plain language before pointing at the real files. Otherwise: `CLAUDE.md` for
the architecture rules, service list, and conventions; `docs/ARCHITECTURE.md` for diagrams;
`notes/PROGRESS.md` for what's done and what's next. (`notes/` is gitignored — local working notes,
not part of the shipped project.)

## Stack

- **Backend:** NestJS (TypeScript), one service per package, pnpm workspaces
- **Messaging:** Kafka (KafkaJS / `@nestjs/microservices`), locally via Redpanda
- **Sync calls:** gRPC (`@nestjs/microservices`, `.proto` contracts)
- **Data:** Postgres per service (Prisma), Redis for inventory reservations
- **Auth:** Keycloak (Authorization Code + PKCE), services verify JWTs locally via JWKS
- **Frontend:** Next.js (`apps/web`)
- **Infra:** Docker Compose locally; Prometheus/Grafana/OpenTelemetry planned later

## Quickstart

```sh
pnpm install
docker compose up -d

# copy env files, then run migrations for each DB service
for s in catalog inventory orders payments; do cp services/$s/.env.example services/$s/.env; done
cp services/gateway/.env.example services/gateway/.env
cp services/notifications/.env.example services/notifications/.env
cp apps/web/.env.example apps/web/.env.local
for s in catalog inventory orders payments; do pnpm --filter $s exec prisma migrate dev; done

pnpm -r run build
pnpm --filter <service> run start:dev
```
