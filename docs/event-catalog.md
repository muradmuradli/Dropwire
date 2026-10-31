# Event catalog

All events are published to Kafka (Redpanda locally) via the transactional outbox pattern. Every
event shares a common envelope:

```json
{
  "id": "uuid",
  "type": "OrderPlaced",
  "version": 1,
  "occurredAt": "2026-01-01T00:00:00.000Z",
  "correlationId": "uuid",
  "payload": { "...": "event-specific fields" }
}
```

All consumers must be idempotent (dedupe by `id`). The JSON Schema file for each event lives in
`contracts/events/`, generated into each consuming service's own `src/generated/events/` (see
`scripts/gen-contracts.js`) — never a shared runtime package.

| Topic | Event type | Producer | Consumer(s) |
|---|---|---|---|
| `order.placed` | `OrderPlaced` | orders | inventory |
| `inventory.reserved` | `InventoryReserved` | inventory | orders, payments |
| `inventory.released` | `InventoryReleased` | inventory | orders |
| `payment.checkout_created` | `PaymentCheckoutCreated` | payments | orders |
| `payment.confirmed` | `PaymentConfirmed` | payments | orders |
| `payment.failed` | `PaymentFailed` | payments | orders |
| `order.confirmed` | `OrderConfirmed` | orders | notifications |
| `order.cancelled` | `OrderCancelled` | orders | notifications |

## Saga flow

**Happy path:** `OrderPlaced` → `InventoryReserved` → `PaymentCheckoutCreated` →
`PaymentConfirmed` → `OrderConfirmed`. `PaymentCheckoutCreated` isn't a saga state transition on
its own (the order stays `RESERVED`) — it's how the customer's browser learns where to redirect
for the real (test-mode) Stripe Checkout step. See `docs/decisions/0034`.

**Failure path:** `PaymentFailed` → `InventoryReleased` → `OrderCancelled`

The orders service orchestrates the saga and owns saga state; it is the only service that reacts to
events from more than one other service and decides the next step.
