# 0026: Order history list

## Context
`orders` only ever exposed `GET /orders/:orderId` (single lookup). Cart/checkout
([0025](0025-cart-and-checkout.md)) can place an order and track it by id, but a customer had no
way to see past orders — the navbar's "Orders" link (`apps/web`) already pointed at `/orders`,
which 404'd since no page existed. This was the one explicitly-deferred piece of the
customer-facing flow roadmap.

## Decision
- **`GET /orders`, scoped to the caller's verified JWT `sub`, no query param or body field that
  could ask for someone else's.** Ownership here is structural (the query itself is always
  `WHERE customerId = <caller>`), unlike the single-order route's after-the-fact `403` check —
  there's nothing to check against because the list can never contain another customer's orders in
  the first place.
- **No pagination** — same simplicity as catalog's `GET /products`/`GET /drops`, neither of which
  paginate either. `take: 50` (newest first) is a defensive cap, not real pagination machinery; not
  worth building for a project with no real user base.
- **Added `@@index([customerId])` to `Order`** (`services/orders/prisma/schema.prisma`) — the first
  query that actually filters by `customerId` rather than only ever looking up by primary key.
- **Extracted the status→label/body/icon/tone mapping** out of `order-tracker.tsx` into
  `apps/web/src/lib/order-status.ts`, shared by both the tracker page and the new list page, rather
  than maintaining the same five statuses' copy twice.
- **List items show the same information the tracker page does** (status, item count, created
  date) — `orders` doesn't own product names any more on the list than it does on the single-order
  page; not a new gap, the existing one in a second place.

## Consequences
- `gateway`'s `OrdersProxyController` gained a matching `GET /orders` forward, using the same
  `ProxyService.forward` the other two routes already use — no new auth guard needed, the
  controller's existing `JwtAuthGuard` already covers it.
- **Verified for real against the live running stack**: placed several real orders for one test
  customer and a separate order for a different test customer (same throwaway fake-JWKS technique
  as the cart/checkout verification), confirmed through `gateway` that each customer's `GET /orders`
  only ever returns their own, newest first. Confirmed the `/orders` page's unauthenticated redirect,
  genuine empty state, and that each card links to the right `/orders/[id]`. Test orders/reservations
  cleaned up afterward.
