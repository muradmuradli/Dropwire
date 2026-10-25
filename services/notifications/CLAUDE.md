# notifications

## Responsibility
Consumes saga outcome events and logs/sends mock emails (order confirmation, order cancellation).
Pure consumer — produces no events and has no API other than its health check. Implemented:
`OrderEventsConsumer` (`src/notifications/order-events.consumer.ts`) parses incoming
`OrderConfirmed`/`OrderCancelled` messages and calls `NotificationService`, which logs the mock
"email." No outbox here — this service never produces events, only consumes.

**Dedup without a database**: idempotency (the root `CLAUDE.md`'s "dedupe by event id" rule) is a
bounded in-memory cache of recently-seen event ids inside `NotificationService`, not a durable
store — deliberate, since this service owns no database by design and the one side effect here
(logging) is harmless to repeat anyway. Full reasoning in
[`docs/decisions/0016`](../../docs/decisions/0016-notifications-consumer.md).

## Events
Produces: none.
Consumes: `OrderConfirmed` (`order.confirmed`), `OrderCancelled` (`order.cancelled`).

## Data ownership
None — stateless consumer. No database.

## Port
`3005` (see `.env.example`).
