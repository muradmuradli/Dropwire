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

All consumers must be idempotent (dedupe by `id`). This table is the plan — the actual JSON Schema
files for each event (`contracts/events/`) haven't been written yet; that's intentionally left for
when the saga logic itself gets implemented, not done upfront.

| Topic | Event type | Producer | Consumer(s) |
|---|---|---|---|
| `order.placed` | `OrderPlaced` | orders | inventory |
| `inventory.reserved` | `InventoryReserved` | inventory | orders, payments |
| `inventory.released` | `InventoryReleased` | inventory | orders |
| `payment.confirmed` | `PaymentConfirmed` | payments | orders |
| `payment.failed` | `PaymentFailed` | payments | orders |
| `order.confirmed` | `OrderConfirmed` | orders | notifications |
| `order.cancelled` | `OrderCancelled` | orders | notifications |

## Saga flow

**Happy path:** `OrderPlaced` → `InventoryReserved` → `PaymentConfirmed` → `OrderConfirmed`

**Failure path:** `PaymentFailed` → `InventoryReleased` → `OrderCancelled`

The orders service orchestrates the saga and owns saga state; it is the only service that reacts to
events from more than one other service and decides the next step.
