# inventory

## Responsibility
Source of truth for available stock and the service that must never oversell. Reservation
bookkeeping happens atomically in Redis (Lua script, to avoid race conditions under concurrent
load), with Postgres holding the durable record. Exposes a gRPC `ReserveStock`/`ReleaseStock` API
(`contracts/proto/inventory.proto`) for the orders service's synchronous reservation check, and also
emits events once a reservation is durably recorded.

## Events
Produces: `InventoryReserved` (`inventory.reserved`), `InventoryReleased` (`inventory.released`).
Consumes: `OrderPlaced` (`order.placed`) — triggers a reservation attempt.

## Data ownership
`inventory-db` (Postgres, port `5434` locally) for the durable reservation record; Redis (port
`6379`) for the atomic stock counters. Prisma schema currently has only a placeholder `HealthCheck`
model — the real reservation schema and Lua scripts come in the next session.

## Port
`3002` (see `.env.example`).
