# orders

## Responsibility
Order lifecycle and saga orchestration. The only service that reacts to events from more than one
other service and decides what happens next. Calls inventory synchronously via gRPC
(`ReserveStock`) as the first step of placing an order, then drives the rest of the saga via Kafka
events.

## Events
Produces: `OrderPlaced` (`order.placed`), `OrderConfirmed` (`order.confirmed`),
`OrderCancelled` (`order.cancelled`).
Consumes: `InventoryReserved` (`inventory.reserved`), `InventoryReleased` (`inventory.released`),
`PaymentConfirmed` (`payment.confirmed`), `PaymentFailed` (`payment.failed`).

## Saga
Happy path: `OrderPlaced → InventoryReserved → PaymentConfirmed → OrderConfirmed`.
Failure path: `PaymentFailed → InventoryReleased → OrderCancelled`.

## Data ownership
`orders-db` (Postgres, port `5435` locally) — the order record plus saga state and the outbox
table. Prisma schema currently has only a placeholder `HealthCheck` model — the real `Order` and
`Outbox` models, plus the saga state machine, come in the next session.

## Port
`3003` (see `.env.example`).
