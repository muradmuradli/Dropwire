# 0025: Cart and checkout

## Context
`apps/web` could browse drops/products but not buy anything. The navbar's `CartSheet` was a static
empty-state shell carried over from the Lovable reference port, with copy implying a timed stock
hold ("items are held for you while the timer runs… reservations last 10 minutes") — but the only
real reservation this project has is the synchronous `POST /orders` → gRPC `ReserveStock` call
([0007](0007-inventory-reservation-contract.md)/[0011](0011-inventory-reservation-idempotency.md)),
which happens once, at checkout. There was no hold to describe, so that copy was fake theater of
exactly the kind earlier sessions deliberately avoided ([0022](0022-home-drops-page.md)).

## Decision
- **Cart is client-only state, persisted to `localStorage`**, no backend change —
  `lib/cart-context.tsx`, a hand-rolled `CartProvider`/`useCart()` following the same pattern as
  `AuthProvider`/`useAuth()` rather than pulling in a state library. Reads/writes are wrapped in
  try/catch (private browsing, cleared/blocked site data) — falls back to an empty cart rather than
  crashing. The real cart is only loaded after mount (there's nothing to read server-side), so the
  initial render always starts empty before hydrating from storage.
- **Cart items store a denormalized snapshot** (`name`, `priceCents`, `imageUrl` at add-time, not
  just a `productId`) so the sheet and checkout page render without extra fetches, and a stale entry
  from a previous session still displays sensibly. Adding a product already in the cart increases
  its quantity instead of duplicating a row.
- **Stock stays a surprise until checkout**, continuing [0022](0022-home-drops-page.md)'s stance —
  the cart never checks real stock itself.
- **"Add to cart" only renders for products in a `LIVE` drop** (`drops/[id]/page.tsx`) — an
  `UPCOMING` drop isn't open yet, an `ENDED` one no longer accepts orders. This is enforced only on
  the frontend; neither `orders` nor `inventory` check drop status today, and still don't after
  this change. A known, not-fixed gap, not something silently built around.
- **Checkout (`app/checkout/page.tsx`) handles all three real outcomes of `placeOrder`**
  ([0012](0012-order-placement-partial-failure.md)):
  - `RESERVED` → clear the cart, navigate to `/orders/[id]`. The saga still has to finish
    asynchronously; the order page handles that.
  - `CANCELLED` → a synchronous decline. The per-item breakdown in the response
    (`reservation.items`, mirroring inventory's `ReservationStatus` enum —
    `OUT_OF_STOCK`/`PRODUCT_NOT_FOUND`) is used to flag exactly which line failed and why. The cart
    is **not** cleared, so the customer can lower a quantity or drop an item and resubmit.
  - `RESERVATION_FAILED` → inventory was unreachable after retries, a transport problem rather than
    a business decline — shown as one generic message, cart kept, retry just resubmits.
- **Order tracking (`app/orders/[id]/page.tsx`) polls every 3s while `status` is `PLACED` or
  `RESERVED`**, and stops once it reaches a terminal status (`CONFIRMED`/`CANCELLED`/
  `RESERVATION_FAILED`) — `GET /orders/:orderId` only reflects Postgres at the moment it's called;
  the saga's later steps (`payments` → `orders` over Kafka, [0015](0015-orders-consumes-payment-events.md))
  happen out of band from this request.

## Consequences
- No new frontend dependency — plain React context + `localStorage`, consistent with how
  `AuthProvider` is already hand-rolled.
- **Not done, deliberately**: order history (a list of a customer's past orders) — it needs a new
  backend endpoint (`GET /orders` for the current customer) that doesn't exist yet; only
  single-order lookup does. Tracked separately in `notes/PROGRESS.md`'s roadmap.
- **Verified for real against the live running stack** (`gateway`/`catalog`/`inventory`/`orders`/
  `payments`/`notifications`, real Keycloak login): added items from a `LIVE` drop and confirmed no
  buy control appears on `UPCOMING`/`ENDED` ones; adjusted quantity and removed a line in the cart
  sheet, reloaded, and confirmed the cart survived via `localStorage`; hit `/checkout`
  unauthenticated and confirmed the redirect to `/login?redirect=/checkout`; placed a real order
  with enough stock and watched it clear the cart, land on the order page at `RESERVED`, and poll to
  a terminal `CONFIRMED`/`CANCELLED` once the real saga finished; forced a `CANCELLED` decline by
  requesting more than available stock and confirmed the cart was kept, the specific insufficient
  item was identified, and resubmitting after lowering the quantity succeeded. Test catalog data and
  reservations cleaned up afterward.
