# payments

## Responsibility
Mocked payment provider with a configurable failure rate (to exercise the saga's failure/compensation
path on demand). Attempts a charge once inventory is reserved for an order.

## Events
Produces: `PaymentConfirmed` (`payment.confirmed`), `PaymentFailed` (`payment.failed`).
Consumes: `InventoryReserved` (`inventory.reserved`) — triggers a payment attempt.

## Data ownership
`payments-db` (Postgres, port `5436` locally) — the payment record and the outbox table. Prisma
schema currently has only a placeholder `HealthCheck` model — the real `Payment` model and the mock
provider's configurable failure logic come in the next session.

## Port
`3004` (see `.env.example`).
