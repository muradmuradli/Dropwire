# inventory

## Responsibility
Source of truth for available stock and the service that must never oversell. Reservation
bookkeeping happens atomically in Redis (Lua scripts in `src/redis/scripts/`, to avoid race
conditions under concurrent load), with Postgres holding the durable record. Exposes a gRPC
`ReserveStock`/`ReleaseStock` API (`contracts/proto/dropwire/inventory/v1/inventory.proto`, served on
`GRPC_PORT`) for the orders service's synchronous reservation check — implemented in
`src/reservation/`. Idempotency across the two stores (Postgres written first, Redis idempotent on
`order_id` too) is documented in
[`docs/decisions/0011`](../../docs/decisions/0011-inventory-reservation-idempotency.md).

**Publishes events via a transactional outbox** (`src/outbox/`, `src/kafka/`): `ReserveStock`
(on `RESERVED` only) and `ReleaseStock` (when something was actually released) write an
`OutboxMessage` row in the same Postgres transaction as the business write, and
`OutboxRelayService` (`@Interval(2000)`) polls for unpublished rows and publishes them to Kafka via
a `kafkajs`-backed `KafkaProducerService`. Design reasoning (polling over CDC, mark-not-delete,
stop-the-tick-on-failure, why `kafkajs` directly instead of `@nestjs/microservices`'s Kafka
transport) in
[`docs/decisions/0013`](../../docs/decisions/0013-transactional-outbox-relay.md).

## Events
Produces: `InventoryReserved` (`inventory.reserved`), `InventoryReleased` (`inventory.released`).
Consumes: `OrderPlaced` (`order.placed`) — triggers a reservation attempt. Not implemented yet;
`ReserveStock` is currently only reachable via the synchronous gRPC call.

## Data ownership
`inventory-db` (Postgres, port `5434` locally): `Stock` (total quantity per product),
`Reservation`/`ReservationItem` (the per-order ledger, keyed on `order_id` for idempotency), and
`OutboxMessage` (the transactional outbox — see `docs/decisions/0013`). Redis (port `6379`) holds
the live `stock:{productId}` counters, reseeded from Postgres on every boot — Postgres is the
source of truth, Redis is a performance cache over it, not a second one. No `Product`/`Drop` data
lives here; `catalog` owns that, referenced only by `productId` string, no FK.

## Port
`3002` HTTP (see `.env.example`), `4002` gRPC (`GRPC_PORT`).

## Health
`GET /health` checks both Postgres and Redis (`RedisService.pingCheck()`), the latter with a 2s
timeout — ioredis's own reconnect/backoff on a dropped connection can otherwise take tens of
seconds before a queued command rejects, which defeats the point of a health check.
