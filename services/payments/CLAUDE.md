# payments

## Responsibility
Mocked payment provider with a configurable failure rate (`PAYMENT_FAILURE_RATE`, default `0.3`;
to exercise the saga's failure/compensation path on demand). Consumes `InventoryReserved` via a
real Kafka consumer (`src/payment/payment-events.consumer.ts`), attempts a mock charge
(`src/payment/payment.service.ts`: a single `Math.random()` roll, no fake delay or varied failure
reasons), and publishes the outcome via its own transactional outbox (`src/outbox/`, same pattern
as `inventory`'s — see `docs/decisions/0013`). `orderId` is the idempotency key for the whole
flow — a `Payment` row is written `PENDING` before the charge "runs," same shape as inventory's
`Reservation` (`docs/decisions/0011`), so a redelivered Kafka message is always either a safe
no-op or a safe retry, never a double charge. Full reasoning (why `orderId` over tracking event
ids directly, why a thrown processing error is left to retry but a malformed message is dropped,
why raw `kafkajs` for the consumer too) in
[`docs/decisions/0014`](../../docs/decisions/0014-payments-mock-provider.md).

## Events
Produces: `PaymentConfirmed` (`payment.confirmed`), `PaymentFailed` (`payment.failed`).
Consumes: `InventoryReserved` (`inventory.reserved`) — triggers a payment attempt.

## Data ownership
`payments-db` (Postgres, port `5436` locally): `Payment` (one row per order, keyed on `orderId`)
and `OutboxMessage` (the transactional outbox).

## Port
`3004` (see `.env.example`).
