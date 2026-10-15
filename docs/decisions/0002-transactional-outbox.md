# 0002: Transactional outbox pattern

## Context
A service that writes to its own Postgres database and then publishes a Kafka event has two
non-atomic operations. If the process crashes between the DB commit and the Kafka publish, the event
is lost and other services never learn about a state change that did happen (e.g. a reservation was
recorded but `InventoryReserved` never fires).

## Decision
Every service that publishes events writes the event into an `outbox` table in the *same* Postgres
transaction as its business write. A separate relay (polling the outbox table, or Debezium-style CDC
in a later iteration) publishes outbox rows to Kafka and marks them as sent.

## Consequences
- Event publication becomes atomic with the business write that caused it — no lost or
  double-interpreted events from a crash mid-operation.
- Adds an extra table and a relay process/poller per service; this is accepted complexity in
  exchange for correctness, since overselling or silently losing a saga step is the failure mode this
  whole project is designed to prevent.
- The relay itself must dedupe/mark-sent carefully to keep delivery at-least-once rather than
  exactly-once, which is fine since consumers are already required to be idempotent (see ADR 0001).
