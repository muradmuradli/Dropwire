# Dropwire

A flash-sale / limited-drop e-commerce platform built as a portfolio project. The core engineering
goal: never oversell stock under heavy concurrent load, and recover cleanly when a dependency fails.

## Services and ownership

| Service | Responsibility | Owns |
|---|---|---|
| `services/gateway` | Routing, JWT validation, rate limiting | nothing (no DB) |
| `services/catalog` | Products and drops | `catalog-db` |
| `services/inventory` | Stock reservation (Redis atomic ops + Postgres record) | `inventory-db`, Redis |
| `services/orders` | Order lifecycle, saga orchestration | `orders-db` |
| `services/payments` | Mocked payment provider, configurable failure rate | `payments-db` |
| `services/notifications` | Consumes events, logs/sends mock emails | nothing (no DB) |
| `apps/web` | Next.js frontend (placeholder UI for now) | — |

Each service has its own `CLAUDE.md` describing its events produced/consumed and data ownership in
more detail.

## Architecture rules

- **No code sharing between services.** Services depend only on `contracts/` (proto + JSON Schema —
  currently empty placeholders, see `notes/PROGRESS.md`), never on each other's source. Once contracts
  exist, types get generated into each consuming service's own `src/generated/` (gitignored) — not
  a shared runtime package.
- **No shared database.** Each service owns its own Postgres instance. No service holds credentials
  to another service's database.
- **Transactional outbox.** Any service that writes to Postgres and then publishes a Kafka event
  writes the event into an outbox table in the same transaction as the business write.
- **Idempotent consumers.** Every Kafka consumer must dedupe by event `id`.
- **Saga ownership.** The orders service orchestrates the order saga and owns saga state:
  `OrderPlaced → InventoryReserved → PaymentConfirmed → OrderConfirmed`, with the failure path
  `PaymentFailed → InventoryReleased → OrderCancelled`.
- **Event envelope.** Every event has `id`, `type`, `version`, `occurredAt`, `correlationId`, and
  `payload`. See `docs/event-catalog.md`.
- **No local user tables.** The JWT `sub` claim (verified against Keycloak's JWKS) is the user id
  everywhere. See `docs/auth.md`.
- **Health + logging.** Every service exposes `GET /health` (`@nestjs/terminus`) and logs structured
  JSON via `nestjs-pino`, with every log line carrying a `correlationId`.

See `docs/ARCHITECTURE.md` for diagrams and `docs/decisions/` for the ADRs behind these rules.

## Running things

```sh
pnpm install                 # install the whole workspace
docker compose up -d         # Postgres x4, Redis, Redpanda (Kafka), Keycloak, Prometheus, Grafana

pnpm --filter <service> run start:dev   # run one service
pnpm -r run build            # build everything
pnpm -r run test             # unit tests
pnpm --filter <service> run test:e2e    # e2e tests (needs that service's DB/infra running)
pnpm -r run lint
```

Each service has its own `.env.example` — copy it to `.env` before running locally. DB services need
`prisma migrate dev` run once against their container before the health check will report healthy.

## Conventions

- **Naming:** kebab-case files, PascalCase classes, camelCase everything else — standard Nest style.
- **Error format:** every thrown HTTP error is caught by a per-service `AllExceptionsFilter` and
  returned as `{ "error": { "code", "message", "correlationId" } }`.
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/) —
  `type(scope): short imperative description` (e.g. `feat(orders): add saga state machine`,
  `fix(inventory): prevent negative stock on concurrent reserve`). Common types: `feat`, `fix`,
  `docs`, `refactor`, `test`, `chore`. Scope is usually the service name. Body (if any) explains
  *why* when it isn't obvious from the diff. Breaking changes: `!` after the scope
  (`feat(gateway)!: ...`) or a `BREAKING CHANGE:` footer. No `Co-Authored-By` trailer — commits are
  authored under the repo owner's identity only, regardless of any default assistant attribution
  convention.

## Pointers

- `docs/ARCHITECTURE.md` — service + saga diagrams
- `docs/event-catalog.md` — topic/producer/consumer table
- `docs/auth.md` — Keycloak/PKCE/JWT flow
- `docs/decisions/` — ADRs
- `notes/PROGRESS.md` — what's done, what's next (gitignored — local working notes, not committed)
- `notes/LEARNING.md` — beginner-friendly explainer of the concepts in this stack (also gitignored)
- `notes/AUTH.md` — step-by-step walkthrough of the auth code actually built, file by file (also gitignored)
