# 0013: Transactional outbox + relay (inventory)

## Context
`inventory` needs to publish `InventoryReserved`/`InventoryReleased` (per
[`docs/event-catalog.md`](../event-catalog.md) and [0007](0007-inventory-reservation-contract.md))
after a reservation decision, but publishing straight to Kafka from inside `ReserveStock`/
`ReleaseStock` has a real failure mode: if the Postgres write succeeds but the Kafka publish then
fails (Kafka down, network blip), the durable record and the event stream permanently disagree —
with no way to tell, later, that an event never went out. The root `CLAUDE.md`'s transactional
outbox rule exists specifically to remove that gap: write the event into a table in the *same*
Postgres transaction as the business write, so the two can never diverge, and have something
separate pick up outbox rows and actually publish them.

## Decision
- **One `OutboxMessage` row per event, written inside the same `$transaction` as the business
  write it reports on** — in `ReservationService.finalizeReservation` (only when the outcome is
  `RESERVED` — a failed reservation doesn't get an event, `orders` already has the answer
  synchronously from the gRPC response) and in `releaseStock` (only when something was actually
  released). The row *is* the event envelope from `contracts/events/envelope.schema.json` —
  `id`/`occurredAt`/`createdAt` come from Prisma defaults, the rest is filled in per event.
- **A polling relay, not Postgres `LISTEN`/`NOTIFY` or CDC.** `OutboxRelayService` runs on a plain
  `@Interval(2000)` (via `@nestjs/schedule`), reading up to 50 unpublished rows
  (`publishedAt: null`) at a time. CDC (e.g. Debezium) is the production-grade answer to this same
  problem, but it's a whole extra piece of infrastructure to run and operate — polling a table
  every two seconds is the right amount of mechanism for this project's actual scale.
- **Rows are marked `publishedAt`, never deleted** — same philosophy already applied to
  `Reservation`/`ReservationItem` rows ([0011](0011-inventory-reservation-idempotency.md)):
  unbounded growth is a known, accepted tradeoff for a project at this scale, not something worth
  building retention/archival logic for right now.
- **One message published at a time within a tick, not a batch-send.** If publishing message *N*
  fails, the loop stops immediately (not just skips) rather than trying every remaining message in
  the batch — a Kafka outage would otherwise fail every one of them for the same reason, which is
  just noise. Everything from *N* onward (including *N* itself, since it's still unmarked) gets
  retried on the next tick automatically.
- **A duplicate publish is an accepted possibility, not something this code tries to prevent.** If
  the process crashes *after* a successful `producer.send` but *before* the `publishedAt` update
  lands, the same message gets republished on the next tick. This is deliberately not solved here
  — the root `CLAUDE.md` already requires every Kafka consumer to dedupe by event `id`
  ("idempotent consumers"), so a rare duplicate is something the *next* piece of work (actual
  consumers in `orders`/`payments`/`notifications`) already has to handle regardless. Solving it
  twice would be redundant.
- **`kafkajs` directly, wrapped in its own `KafkaProducerService`, not `@nestjs/microservices`'s
  Kafka transport.** `inventory` is purely a producer here — there's no consumer, no
  request/response semantics, nothing the microservices abstraction would actually buy. Wrapping
  the raw client in its own small Nest-managed service (same pattern as `RedisService`) keeps the
  relay's own logic trivially mockable in tests, without needing to fight `ClientKafka`'s
  request-response-oriented API for a feature that's neither.
- **Kafka message key is the event's `orderId`** when the payload has one (both current event
  types do), falling back to the event's own `id` otherwise — so a future consumer partitioned by
  key sees every event for one order in order.

## Consequences
- `@nestjs/schedule` had to be pinned to `6.1.3` rather than whatever `^` would otherwise resolve
  to (`12.0.2` at the time) — that build is ESM-only and breaks under this project's
  Jest/CommonJS setup, the exact same problem class `notes/PROGRESS.md` already documented for
  `@nestjs/testing`. `6.1.3` is the newest release whose peer range still matches this project's
  pinned Nest v11 line.
- Verified for real against the actual `docker compose` Redpanda, not mocked: called `ReserveStock`
  over gRPC, confirmed the `OutboxMessage` row appeared and then got `publishedAt` set within one
  relay tick, and consumed the real message back off `inventory.reserved` via `rpk topic consume`
  — exact envelope shape, correct key. Same for `ReleaseStock` → `inventory.released`. Both topics
  were auto-created by Redpanda's `dev-container` mode defaults; nothing had to create them by
  hand.
- `orders`/`payments`/`notifications` still have no Kafka consumers at all — this is `inventory`'s
  producing side only. Consuming `InventoryReserved`/`InventoryReleased` (and `orders` producing
  its own outbox for `OrderPlaced`/`OrderConfirmed`/`OrderCancelled`) is the next piece of work, not
  part of this one.
