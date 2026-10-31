# 0036: orders checks catalog before reserving stock

## Context
`orders` never called `catalog` at all — `placeOrder` goes straight from validating the request
body to calling `inventory`'s `ReserveStock`, which only knows about `productId` strings via its
own `Stock` table. Deleting a product from `catalog` never touched `inventory-db`, so a customer
with a stale cart entry (or anyone calling the API directly) could still successfully order a
product that no longer exists in the catalog at all — the mirror image of `docs/decisions/0035`
(that one was "create doesn't provision stock"; this one is "delete doesn't get checked for").

## Decision
- **A new synchronous check against `catalog`, before the gRPC call to `inventory`.** Both
  `placeOrder` and `retryReservation` call a new `CatalogClient.productExists(productId)` for
  every distinct product in the order; if any are missing, the order is rejected without ever
  calling `inventory` — there's no point reserving stock for an order that's getting cancelled
  anyway. Checked against `catalog`, not against whether `inventory` still has a `Stock` row for
  it: a product can legitimately have no stock yet and still exist (see `0035`); the two
  questions ("does this exist" vs "is it in stock") are genuinely different and only `catalog`
  can answer the first one.
- **Direct HTTP from `orders` to `catalog`'s own port, not through `gateway`** — same reasoning as
  the existing gRPC call to `inventory`: `gateway` is the frontends' entry point, not an internal
  service mesh, and `catalog`'s `GET /products/:id` has no auth guard anyway
  (`docs/decisions/0017`), so routing through `gateway` would add a hop for no benefit. New
  `CatalogClient` (`src/catalog/catalog-client.service.ts`), new `CATALOG_URL` env var.
- **Only a definitive `404` counts as "doesn't exist."** Any other non-2xx response, or the
  request failing outright, is treated the same as `inventory` being unreachable — a new
  `RESERVATION_FAILED` outcome, not a confirmed cancellation — because "couldn't verify" and
  "confirmed gone" are different claims and shouldn't produce the same response.
- **The rejection reuses the exact `ReserveStockResponse` shape** a real `PRODUCT_NOT_FOUND` gRPC
  response would have (`productNotFoundReservation`, in `OrdersService`) — the missing product(s)
  get `RESERVATION_STATUS_PRODUCT_NOT_FOUND`, every other item in the same order gets
  `RESERVATION_STATUS_UNSPECIFIED` (not `RESERVED` — `inventory` was never asked about them, so
  claiming they're reserved would be a lie). This was the deciding reason to do the check in
  `orders` itself rather than, say, pushing it into `inventory`: `apps/web`'s checkout page
  already renders a `PRODUCT_NOT_FOUND` item exactly right ("This item isn't available anymore.")
  — this needed zero frontend changes.
- **`retryInventoryCall` renamed to `retryCall`** — it was already fully generic over any async
  call, and is now used for both the `inventory` and `catalog` calls; the old name stopped being
  accurate once there were two kinds of call retrying through it.
- **`retryReservation` (the admin "try this stuck order again" action) gets the same check**, for
  the same reason as `placeOrder` — time has passed since the original attempt, so a product that
  existed then could have been deleted since. A missing product here transitions the order
  straight to `CANCELLED`, same as `placeOrder`'s path, rather than leaving it `RESERVATION_FAILED`
  forever with no way to resolve.

## Consequences
- New unit tests: `CatalogClient` (404 → false, other error statuses/network failures throw, the
  configured vs default `CATALOG_URL`), and new `OrdersService` cases for `placeOrder` (missing
  product → `CANCELLED` with no `inventory` call; mixed missing/present items; catalog
  unreachable → `RESERVATION_FAILED`/503) and `retryReservation` (same two outcomes). All existing
  `OrdersService` tests needed no behavior changes, only a mocked `CatalogClient` defaulting to
  "exists" — confirming this doesn't change anything for the common case.
- No new e2e suite — exercising this for real needs `catalog`, `inventory`, and `orders` all
  running together with real deleted-product data, which is a heavier live setup than this
  codebase's existing admin-write e2e suites use; covered by the unit tests above instead, same
  bar as `gateway`'s proxy controllers (`docs/decisions/0032`).
