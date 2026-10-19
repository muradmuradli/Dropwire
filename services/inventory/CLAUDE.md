# inventory

## Responsibility
Source of truth for available stock and the service that must never oversell. Reservation
bookkeeping happens atomically in Redis (Lua scripts in `src/redis/scripts/`, to avoid race
conditions under concurrent load), with Postgres holding the durable record. Exposes a gRPC
`ReserveStock`/`ReleaseStock` API (`contracts/proto/dropwire/inventory/v1/inventory.proto`, served on
`GRPC_PORT`) for the orders service's synchronous reservation check — implemented in
`src/reservation/`. Idempotency across the two stores (Postgres written first, Redis idempotent on
`order_id` too) is documented in
[`docs/decisions/0011`](../../docs/decisions/0011-inventory-reservation-idempotency.md). Does not yet
emit `InventoryReserved`/`InventoryReleased` events — that's the transactional outbox, still to be
built.

## Events
Produces: `InventoryReserved` (`inventory.reserved`), `InventoryReleased` (`inventory.released`) —
not implemented yet, pending the transactional outbox.
Consumes: `OrderPlaced` (`order.placed`) — triggers a reservation attempt. Not implemented yet;
`ReserveStock` is currently only reachable via the synchronous gRPC call.

## Data ownership
`inventory-db` (Postgres, port `5434` locally): `Stock` (total quantity per product) and
`Reservation`/`ReservationItem` (the per-order ledger, keyed on `order_id` for idempotency). Redis
(port `6379`) holds the live `stock:{productId}` counters, reseeded from Postgres on every boot —
Postgres is the source of truth, Redis is a performance cache over it, not a second one. No
`Product`/`Drop` data lives here; `catalog` owns that, referenced only by `productId` string, no FK.

## Port
`3002` HTTP (see `.env.example`), `4002` gRPC (`GRPC_PORT`).
