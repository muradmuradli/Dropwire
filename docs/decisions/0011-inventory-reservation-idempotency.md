# 0011: Inventory reservation idempotency across Redis and Postgres

## Context
`ReserveStock` (see [0007](0007-inventory-reservation-contract.md)) has to touch two systems that
can't be updated in one atomic transaction: Redis (the atomic stock counters) and Postgres (the
durable reservation ledger). If the process crashes between those two steps, a retry with the same
`order_id` needs to land on the same answer, not re-run the stock check and risk decrementing twice.

## Decision
Postgres is written to first, as a durability marker, before Redis is touched at all:

1. **Insert a `PENDING` `Reservation` row keyed on `order_id` before calling Redis.** A unique
   constraint on `order_id` means a repeated call either creates this row (fresh attempt) or hits
   the constraint and reads back whatever's already there.
2. **If the existing row is already a terminal status** (`RESERVED`/`OUT_OF_STOCK`/
   `PRODUCT_NOT_FOUND`), return it directly — no Redis call. This is the common retry case.
3. **If the existing row is still `PENDING`** (a previous attempt crashed after step 1 but before
   finalizing), fall through and run the Redis step anyway.
4. **The Redis side is independently idempotent on `order_id` too** (`reserve.lua` caches its result
   under `reservation:{orderId}` and replays it on a repeat call instead of re-checking/
   re-decrementing stock). This is what makes step 3 safe: whether the crashed attempt got as far as
   Redis or not, retrying is a no-op if it did, and a real attempt if it didn't.
5. **Finalize**: once Redis returns a result, update the Postgres row from `PENDING` to the real
   status and write the per-item ledger (`ReservationItem` rows) in one transaction.

`ReleaseStock` follows the same idempotency shape: `release.lua` checks a `released` flag inside the
same cached Redis payload before incrementing stock back, and the Postgres `Reservation` row moves
to `RELEASED` only after that succeeds. Releasing an order that was never actually reserved (not
found, out of stock, still pending) is a no-op — `PENDING` specifically is rejected with a
`FAILED_PRECONDITION` gRPC error, since `orders` releasing a reservation that hasn't resolved yet is
a contract violation, not a routine case.

Redis is treated as a cache over Postgres's durable state, not a second source of truth: on every
boot, `stock:{productId}` counters are recomputed from `Stock.totalQuantity` minus the sum of active
(`RESERVED`) `ReservationItem` rows in Postgres, discarding whatever was in Redis before.

## Consequences
- A crash at any point between steps 1–5 is recoverable by simply retrying `ReserveStock` with the
  same `order_id` — verified directly (see test notes in this session) by hand-inserting a `PENDING`
  row to simulate a crash and confirming the retry resolves it correctly without double-decrementing.
- Reservation ledger rows (`Reservation`/`ReservationItem`) and the Redis `reservation:{orderId}` key
  are never deleted or expired. For a flash-sale's order volume this is fine; a long-running
  production system would eventually need a cleanup/archival job for both. Not built — out of scope
  for this pass.
- **One known gap, accepted as a portfolio-project tradeoff rather than solved:** if the inventory
  process restarts (not a fresh `docker compose up`, which wipes Redis entirely) while a reservation
  is genuinely still `PENDING` in Postgres and already decremented in Redis, the boot-time reseed
  recomputes `stock:*` from Postgres's view (which doesn't know about that in-flight decrement yet)
  and effectively un-reserves it, while the Redis-side `reservation:{orderId}` cache for that specific
  order still remembers the original decremented outcome. The two facts go briefly inconsistent for
  that one order until it's retried and finalized. This doesn't cause overselling (the invariant this
  service exists to protect) — only a narrow, self-correcting undercount — so it wasn't worth the
  added complexity of reconciling the two stores more tightly for this project's purposes.
