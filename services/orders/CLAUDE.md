# orders

## Responsibility
Order lifecycle and saga orchestration. The only service that reacts to events from more than one
other service and decides what happens next. Calls inventory synchronously via gRPC
(`ReserveStock`) as the first step of placing an order, then (eventually) drives the rest of the
saga via Kafka events.

**Only the saga's first step is implemented so far** (`POST /orders` in `src/orders/`): create an
`Order`, call inventory's `ReserveStock`, record `RESERVED`/`CANCELLED` based on the result. No
retry/recovery logic yet if the gRPC call itself fails (the order is just left `PLACED`) — that
belongs to the full saga orchestration, not built yet. `customerId` is currently a plain request
body field, **not** derived from a verified JWT yet — the root `CLAUDE.md`'s "JWT `sub` claim is the
user id everywhere" rule isn't wired up here yet (see `notes/PROGRESS.md`).

## Events
Produces: `OrderPlaced` (`order.placed`), `OrderConfirmed` (`order.confirmed`),
`OrderCancelled` (`order.cancelled`) — not implemented yet, pending the transactional outbox.
Consumes: `InventoryReserved` (`inventory.reserved`), `InventoryReleased` (`inventory.released`),
`PaymentConfirmed` (`payment.confirmed`), `PaymentFailed` (`payment.failed`) — not implemented yet.

## Saga
Happy path: `OrderPlaced → InventoryReserved → PaymentConfirmed → OrderConfirmed`.
Failure path: `PaymentFailed → InventoryReleased → OrderCancelled`.
Only the first synchronous step (`ReserveStock`) exists today; everything from `PaymentConfirmed`
onward is still just this plan, not code.

## Data ownership
`orders-db` (Postgres, port `5435` locally): `Order`/`OrderItem` (replacing the placeholder
`HealthCheck`). No `Outbox` table yet — that comes with the transactional outbox work.

## Port
`3003` HTTP (see `.env.example`). Calls inventory's gRPC server at `INVENTORY_GRPC_URL`
(`localhost:4002` locally) — doesn't run its own gRPC server.
