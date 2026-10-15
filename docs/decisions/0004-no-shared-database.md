# 0004: No shared database

## Context
A flash-sale system that must never oversell is only as correct as its weakest coupling point.
A database shared across services is one of the easiest ways for that coupling to become implicit:
one service's migration or query pattern can silently break another's invariants, and it becomes
impossible to reason about who is allowed to write what.

## Decision
Every service owns its own Postgres database (`catalog-db`, `inventory-db`, `orders-db`,
`payments-db`). No service is given credentials to another service's database. All cross-service
data access goes through the service's own API (gRPC) or through events it publishes — never direct
SQL.

## Consequences
- Each service's schema can evolve independently; no coordinated cross-service migrations.
- Data that multiple services care about (e.g. an order's current status, as seen from
  notifications) is obtained via events, not joins — this is the tradeoff that makes the outbox
  pattern (ADR 0002) and idempotent consumers (ADR 0001) necessary in the first place.
- Running this locally means one Postgres container per service, which is heavier than a single
  shared instance, but it's what keeps "no shared database" true rather than aspirational.
