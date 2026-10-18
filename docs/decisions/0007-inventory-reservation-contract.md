# 0007: Inventory reservation gRPC contract shape

## Context
`orders` needs a synchronous, immediate answer from `inventory` during the saga's first step —
"was stock reserved for this order, yes or no" — before it can move the saga forward (see
[0001](0001-kafka-for-events.md): this is the one call in the saga that stays gRPC rather than an
async Kafka event, because the caller can't proceed without the answer). Three things about that
call's shape needed a real decision rather than a default:

1. An order can contain multiple products. Does `orders` call `inventory` once per line item, or
   once per order with every item batched in?
2. gRPC calls can be retried by the caller (timeout, dropped connection) without the caller knowing
   whether the original call actually landed. What stops a retry from reserving the same order's
   stock twice?
3. "Out of stock" is a routine, expected outcome of a flash sale under contention — is it modeled
   as response data the caller branches on, or as a thrown gRPC error?

## Decision
`contracts/proto/dropwire/inventory/v1/inventory.proto` defines `InventoryService` with
`ReserveStock` and `ReleaseStock`, shaped as follows (file path and enum value names reflect
[0010](0010-buf-lint-proto-conventions.md)'s later rename; the decisions below are unchanged):

- **Batched, one call per order.** `ReserveStockRequest` carries `order_id` plus a
  `repeated StockItem items`. Inventory reserves the whole order atomically on its side (a single
  Redis/Lua operation); `orders` never has to track partial success across multiple calls for one
  order.
- **`order_id` is the idempotency key — no separate `reservationId` field.** One order has exactly
  one reservation attempt in this saga, so there's nothing a second field would disambiguate.
  Inventory must recognize a repeated `order_id` and return the same result rather than reserving
  again. `ReleaseStock` keys off `order_id` alone too (no item list) since inventory already knows
  what it reserved under that id.
- **Structured status in the response, not gRPC error codes.** `ReserveStockResponse.status` is a
  `ReservationStatus` enum (`RESERVATION_STATUS_RESERVED`, `RESERVATION_STATUS_OUT_OF_STOCK`,
  `RESERVATION_STATUS_PRODUCT_NOT_FOUND`), with per-item detail in `ReserveStockItemResult`. The
  response is all-or-nothing: `status == RESERVATION_STATUS_RESERVED` only if every item in the
  request was reserved — there is no partial reservation for the saga to track. A thrown gRPC
  error is reserved for real transport/infra failures (unreachable, timeout), which `orders`
  already has to handle differently (retry) than a business "no" (compensate/cancel).

## Consequences
- `orders`' saga code gets one clear branch point per call: a transport error means retry-or-fail
  the saga step, a `RESERVATION_STATUS_RESERVED`/non-reserved status means proceed-or-compensate.
  The two failure modes are never conflated into the same gRPC exception path.
- Idempotency correctness now depends on inventory actually keying its reservation state by
  `order_id` and short-circuiting a repeat — this needs to be a real check in the service
  implementation (not just assumed by the contract), when `ReserveStock` is implemented.
- Because reservation is all-or-nothing per order, inventory cannot partially fill an order even if
  some items had stock and others didn't; this matches the saga's compensation model (the whole
  order fails or proceeds), at the cost of not being able to offer a customer a partial shipment.
- This contract only covers the synchronous call `orders` waits on. The async side —
  `InventoryReserved`/`InventoryReleased` events published after a reservation decision, consumed
  by `orders`/`payments`/`notifications` — is separate and covered by the event schemas still to be
  designed in `contracts/events/` (see `docs/event-catalog.md`).
