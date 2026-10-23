# 0014: Payments' mock provider and its Kafka consumer

## Context
`payments` needed to become this project's first real Kafka *consumer* — it reacts to
`InventoryReserved` by attempting a mock charge, then produces `PaymentConfirmed`/`PaymentFailed`
via its own outbox (same pattern as [0013](0013-transactional-outbox-relay.md)). A few things
needed a real decision rather than a default.

## Decision
- **`orderId` is the idempotency key, not a separate "processed event ids" table.** Same shape as
  inventory's `Reservation` ([0011](0011-inventory-reservation-idempotency.md)): a `Payment` row
  is inserted with `status: PENDING` *before* the mock charge "runs." If the insert hits the
  `orderId` unique constraint, the existing row tells the story — a terminal status means this
  event (or a redelivery of it) was already fully handled, so it's a no-op; still `PENDING` means
  a previous attempt crashed mid-charge, so it's safe to retry. One order has at most one payment
  attempt, so this is a stronger guarantee than tracking event ids alone would give (and it still
  satisfies the root `CLAUDE.md`'s "dedupe by event id" rule in spirit — the triggering event's id
  is kept on the row for audit, it's just not what makes the check idempotent).
- **A thrown error from actually processing a message is left to propagate; a message that can
  never be parsed or validated is caught and dropped.** `KafkaConsumerService.subscribe()`
  deliberately does not catch errors from its handler — if `PaymentService.handleInventoryReserved`
  throws (e.g. the database is briefly unreachable), kafkajs doesn't commit the offset and retries
  the message, which is safe because handling it is already idempotent. `PaymentEventsConsumer`,
  one layer up, *does* catch JSON-parse failures and missing-field validation — a message that's
  malformed can never succeed no matter how many times it's retried, so retrying it forever would
  just loop; logging and dropping it is the only sane option for that specific class of failure.
- **Raw `kafkajs` for the consumer too, not `@nestjs/microservices`'s Kafka transport** — even
  though this service, unlike `inventory`, is now a genuine consumer (the case
  [0013](0013-transactional-outbox-relay.md) said the microservices abstraction doesn't help).
  The reason here is different: Nest's Kafka transport has its own serialization/deserialization
  conventions for messages handled via `@EventPattern`, and `inventory`'s relay already publishes
  plain hand-rolled JSON (matching `contracts/events/envelope.schema.json` directly, nothing
  Nest-specific). Using a different consumption mechanism than the producing side risks a format
  mismatch for no real benefit — reading the exact same raw JSON string on both ends keeps the
  whole system's event format uniform.
- **The mock charge is a single `Math.random()` roll against `PAYMENT_FAILURE_RATE`** (env var,
  default `0.3`) — no fake processing delay, no varied failure reasons. The one job this needs to
  do is let the saga's compensation path be exercised on demand; a single configurable probability
  is the simplest thing that does that.

## Consequences
- **Verified for real against the actual running stack**, not mocked: started `inventory` and
  `payments` together, confirmed `payments`' consumer actually joined a Kafka consumer group
  (`[ConsumerGroup] Consumer has joined the group`, partition assignment logged by kafkajs itself),
  then drove a real `ReserveStock` call through gRPC and watched the whole chain complete on its
  own — `inventory`'s outbox → `inventory.reserved` → `payments`' consumer → a real `Payment` row
  → `payments`' own outbox → `payment.confirmed`, consumed back via `rpk topic consume` with the
  exact envelope shape. Repeated with `PAYMENT_FAILURE_RATE=1` to confirm the `payment.failed` path
  completes the same way.
- Same unit-test mutation-sanity discipline as previous sessions: inverted the idempotency check's
  condition by hand, confirmed the "no-op on redelivery" and "retries a PENDING order" tests both
  failed for the right reason, then reverted.
- `orders` still doesn't consume `PaymentConfirmed`/`PaymentFailed` — this was the producing
  (inventory→payments) half of that link. Continuing the saga past this point is next.
