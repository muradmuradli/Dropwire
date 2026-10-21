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
built yet. `POST /orders`'s body is validated by hand in `OrdersService.assertValidInput` (at least
one item, each item a non-empty `productId` and a positive whole-number `quantity`) before anything
is written to the database — not a DTO/class-validator pipe, since nothing else in the codebase
uses that pattern yet either.

**Verifies JWTs independently** (`src/auth/`, copied from `gateway`'s pattern — same
`JwtStrategy`/`JwtAuthGuard`/`@CurrentUser()`): both `POST /orders` and `GET /orders/:orderId` are
guarded, and `customerId` comes from the verified `sub` claim, never the request body — satisfies
the root `CLAUDE.md`'s "JWT `sub` claim is the user id everywhere" rule for real now. `GET
/orders/:orderId` also checks the order's `customerId` matches the caller (`403` otherwise) — no
admin bypass yet. This independent check matters even when `gateway` already verified the same
token (see `notes/LEARNING.md` §5, zero trust) — confirmed by hand by calling `orders` directly,
bypassing `gateway` entirely, and getting `401` for no-token/garbage-token exactly as if `gateway`
weren't there.

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
