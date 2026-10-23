# orders

## Responsibility
Order lifecycle and saga orchestration. The only service that reacts to events from more than one
other service and decides what happens next. Calls inventory synchronously via gRPC
(`ReserveStock`) as the first step of placing an order, then (eventually) drives the rest of the
saga via Kafka events.

**The saga's first two steps are implemented** (`src/orders/`). Step one, `POST /orders`: create an
`Order`, call inventory's `ReserveStock` (retried up to 3 times, safe because that call is
idempotent on `order_id` — see `docs/decisions/0012`), and record `RESERVED`/`CANCELLED`/
`RESERVATION_FAILED` based on the result. `RESERVATION_FAILED` means the call itself never got a
real answer even after retrying — a 503, not a dangling `PLACED` row. `POST /orders`'s body is
validated by hand in `OrdersService.assertValidInput` (at least one item, each item a non-empty
`productId` and a positive whole-number `quantity`) before anything is written to the database —
not a DTO/class-validator pipe, since nothing else in the codebase uses that pattern yet either.

Step two: `OrderEventsConsumer` (`src/orders/order-events.consumer.ts`) consumes
`PaymentConfirmed`/`PaymentFailed` and calls into `OrdersService.handlePaymentConfirmed`/
`handlePaymentFailed`. `PaymentConfirmed` → `CONFIRMED` + an `OrderConfirmed` outbox event.
`PaymentFailed` → calls inventory's `ReleaseStock` (idempotent, `docs/decisions/0011`) *before* the
database transition, then → `CANCELLED` + an `OrderCancelled` outbox event carrying the failure
reason. `CANCELLED` now covers two different triggers (inventory declining synchronously, or a
later `PaymentFailed`) — one status, not two, since nothing downstream needs to tell them apart.
Idempotency here is a conditional `updateMany` (`WHERE id = ? AND status = 'RESERVED'`), not an
insert-first pattern — the `Order` row already exists by the time these events arrive, unlike
inventory's `Reservation`/payments' `Payment`. Full reasoning in
[`docs/decisions/0015`](../../docs/decisions/0015-orders-consumes-payment-events.md).

Has its own transactional outbox + relay now too (`src/outbox/`, `src/kafka/`, same pattern as
`inventory`'s/`payments`' — `docs/decisions/0013`), producing `OrderConfirmed`/`OrderCancelled`.
Real recovery for `RESERVATION_FAILED` orders (a background job that revisits them) still belongs
to the full saga orchestration, not built yet.

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
Produces: `OrderConfirmed` (`order.confirmed`), `OrderCancelled` (`order.cancelled`).
`OrderPlaced` (`order.placed`) — not implemented yet; nothing currently needs it asynchronously
since `ReserveStock` is still a synchronous gRPC call.
Consumes: `PaymentConfirmed` (`payment.confirmed`), `PaymentFailed` (`payment.failed`).
`InventoryReserved`/`InventoryReleased` — not consumed; `orders` already gets that answer
synchronously from the `ReserveStock`/`ReleaseStock` gRPC responses.

## Saga
Happy path: `OrderPlaced → InventoryReserved → PaymentConfirmed → OrderConfirmed`.
Failure path: `PaymentFailed → InventoryReleased → OrderCancelled`.
Both the synchronous first step (`ReserveStock`) and the async second step
(`PaymentConfirmed`/`PaymentFailed` → `OrderConfirmed`/`OrderCancelled`, including the
`ReleaseStock` compensation call) are implemented and verified end-to-end for real, both branches
— see `docs/decisions/0015`.

## Data ownership
`orders-db` (Postgres, port `5435` locally): `Order`/`OrderItem` and `OutboxMessage` (the
transactional outbox).

## Port
`3003` HTTP (see `.env.example`). Calls inventory's gRPC server at `INVENTORY_GRPC_URL`
(`localhost:4002` locally) — doesn't run its own gRPC server.
