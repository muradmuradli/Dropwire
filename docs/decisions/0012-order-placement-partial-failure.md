# 0012: Handling a failed ReserveStock call during order placement

## Context
`orders` creates an `Order` row, then calls inventory's `ReserveStock` (see
[0007](0007-inventory-reservation-contract.md)) to decide its outcome. That call can fail at the
transport level — not a business "no" (`OUT_OF_STOCK`/`PRODUCT_NOT_FOUND`), but inventory being
unreachable, timing out, or some other infra problem. Without handling this case, the `Order` row
is left at `PLACED` forever with no way to tell whether it will ever resolve, and the HTTP caller
just sees a generic 500.

## Decision
- **Retry the call up to 3 times, 200ms apart, before giving up.** This is safe specifically
  because `ReserveStock` is idempotent on `order_id` (see
  [0011](0011-inventory-reservation-idempotency.md)) — retrying the exact same request either
  reaches inventory for the first time, or replays a cached answer. There's no risk of
  double-reserving by retrying.
- **If every attempt still fails, record it as its own terminal status: `RESERVATION_FAILED`.**
  This is distinct from `CANCELLED` (inventory answered and said no) — `RESERVATION_FAILED` means
  "we don't actually know if this got reserved or not," which matters if this ever needs
  reconciling later.
- **Return `503 Service Unavailable`** (not the default 500) to the caller, with the `orderId` so
  they can check `GET /orders/:orderId` later rather than needing to guess.

## Consequences
- This is a partial fix, not full recovery. There's still no background job that retries
  `RESERVATION_FAILED` orders automatically — a human (or, later, the real saga orchestrator) has
  to notice and decide what to do. What this does fix: the order's state is always honest
  (`PLACED` only ever means "the call is in flight right now," never "this might be stuck forever
  and nobody can tell"), and a transient blip (a brief network hiccup, inventory mid-restart)
  self-heals within the original request instead of failing immediately.
- Verified by hand: pointed `orders` at a gRPC address nothing was listening on, confirmed the
  order landed on `RESERVATION_FAILED` (not stuck at `PLACED`) and the HTTP response was a `503`
  naming the order id, then confirmed the normal path still works unchanged once pointed back at a
  real inventory.
