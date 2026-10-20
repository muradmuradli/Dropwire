# orders

## Responsibility
Order lifecycle and saga orchestration. The only service that reacts to events from more than one
other service and decides what happens next. Calls inventory synchronously via gRPC
(`ReserveStock`) as the first step of placing an order, then (eventually) drives the rest of the
saga via Kafka events.

**Only the saga's first step is implemented so far** (`POST /orders` in `src/orders/`): create an
`Order`, call inventory's `ReserveStock` (retried up to 3 times, safe because that call is
idempotent on `order_id` — see `docs/decisions/0012`), and record `RESERVED`/`CANCELLED`/
`RESERVATION_FAILED` based on the result. `RESERVATION_FAILED` means the call itself never got a
real answer even after retrying — a 503, not a dangling `PLACED` row. Real recovery (a background
job that revisits `RESERVATION_FAILED` orders) still belongs to the full saga orchestration, not
built yet. `customerId` is currently a plain request body field, **not** derived from a verified
JWT yet — the root `CLAUDE.md`'s "JWT `sub` claim is the user id everywhere" rule isn't wired up
here yet (see `notes/PROGRESS.md`).

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
