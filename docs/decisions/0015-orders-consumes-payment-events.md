# 0015: Orders consumes PaymentConfirmed/PaymentFailed

## Context
`orders` needed to react to `PaymentConfirmed`/`PaymentFailed` to actually continue the saga past
its first step — the happy path's `OrderConfirmed` and the failure path's compensation
(`ReleaseStock` → `OrderCancelled`). Unlike `inventory`'s `Reservation` and `payments`' `Payment`
rows, the `Order` row these events act on **already exists** by the time either event arrives
(created back in `placeOrder`) — so the insert-a-`PENDING`-row-first idempotency pattern from
[0011](0011-inventory-reservation-idempotency.md)/[0014](0014-payments-mock-provider.md) doesn't
apply directly here. A few things needed a real decision.

## Decision
- **A conditional `updateMany` is the idempotency gate, not a fresh insert.**
  `tx.order.updateMany({ where: { id: orderId, status: 'RESERVED' }, data: { status: 'CONFIRMED' } })`
  only actually transitions a row — and the code only writes the outbox event — if it affected
  exactly one row. Postgres evaluates the `WHERE` atomically, so this is a safe compare-and-swap: a
  redelivered event for an order that's already `CONFIRMED`/`CANCELLED` updates zero rows and is a
  no-op, with no separate "have I seen this event id" lookup needed. Both the conditional update
  and the outbox write happen inside one `$transaction(async (tx) => ...)` (the *interactive*
  form, not the array form `inventory`/`payments` use elsewhere) specifically so the "did it
  actually transition" check can gate whether the outbox write happens at all — the array form
  can't branch on one operation's result before deciding whether to include another.
- **`CANCELLED` now covers two different triggers** — inventory synchronously declining the
  reservation in `placeOrder`, and a later async `PaymentFailed` — rather than adding a second
  status. Both mean the same thing from the order's perspective ("didn't go through, nothing to
  ship"); splitting them would only matter if something downstream needed to tell them apart, and
  nothing does.
- **For `PaymentFailed`, `ReleaseStock` is called *before* the database transition, not after** —
  the same ordering principle as inventory's own reserve-then-finalize flow. `ReleaseStock` is
  already idempotent ([0011](0011-inventory-reservation-idempotency.md)), so calling it again on a
  retry is always safe. The reverse order would risk a crash between the two steps leaving the
  order `CANCELLED` in the database while the stock stays reserved forever, with nothing anywhere
  recording that it needs releasing.
- A thrown error from `ReleaseStock` (after retries) or the database step is left to propagate, so
  `KafkaConsumerService` doesn't acknowledge the message and kafkajs retries it — same reasoning as
  [0014](0014-payments-mock-provider.md). A malformed message is caught and dropped in
  `OrderEventsConsumer`, same split as `payments`' own consumer.

## Consequences
- The existing retry helper (`reserveStockWithRetry`) was generalized to `retryInventoryCall<T>`
  so `ReleaseStock` could reuse the same 3-attempts/200ms logic instead of duplicating it.
- **Verified for real, the complete saga, both branches**: started `inventory`, `payments`, and
  `orders` together and drove a real order through `POST /orders` (with a real signed JWT, same
  throwaway-JWKS technique as the gateway/orders auth session) all the way to a terminal state with
  zero manual intervention after the initial HTTP call:
  - Happy path: `RESERVED` → (`inventory.reserved` → `payments` confirms → `payment.confirmed`) →
    `CONFIRMED`, with the real `OrderConfirmed` message read back off Kafka.
  - Failure path (`PAYMENT_FAILURE_RATE=1`): `RESERVED` → (`inventory.reserved` → `payments`
    declines → `payment.failed`) → `CANCELLED`, with inventory's own `Reservation` row for that
    order confirmed `RELEASED` (not just the order's own status taken on faith), and the real
    `OrderCancelled` message — carrying the actual decline reason — read back off Kafka.
  - One real-world wrinkle hit while verifying, worth noting: restarting `payments` abruptly
    (killing the process rather than letting it leave the consumer group cleanly) made its
    *rejoin* of the same consumer group take about 25 seconds (kafkajs's own
    `[ConsumerGroup] Consumer has joined the group` log reported `duration: 25515`) — the broker
    waits out the old member's session timeout before admitting the new one. Not a bug, just a
    reminder that an abrupt restart has a real, visible rebalance cost.
  - Same mutation-sanity check as previous sessions: removed the `status: 'RESERVED'` guard from
    the `handlePaymentConfirmed` conditional update by hand, confirmed the test asserting the exact
    `where` clause failed for the right reason, then reverted.
