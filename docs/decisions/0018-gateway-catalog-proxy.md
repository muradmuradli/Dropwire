# 0018: Gateway proxies to catalog, with no auth guard and a shared ProxyService

## Context
`gateway`'s own architecture diagram (`docs/ARCHITECTURE.md`) draws `gw -- "HTTP" --> catalog`,
but only the `orders` leg of that had ever been built (`src/orders-proxy/`). With catalog's real
`Product`/`Drop` API now in place (`docs/decisions/0017`), this was the next piece to connect.

## Decision
- **No `JwtAuthGuard` on the catalog proxy.** `catalog`'s own routes have no auth guard
  (`docs/decisions/0017` — product/drop browsing is public, like any storefront). Gateway
  shouldn't invent a requirement the upstream service itself doesn't have; `OrdersProxyController`
  guards because `orders` itself requires a token, not because every proxy controller should.
- **Extracted a shared `ProxyService`** (`src/proxy/proxy.service.ts`) from the forwarding logic
  that previously lived only inside `OrdersProxyController`, and refactored that controller to use
  it too. A second, nearly line-for-line copy of the same ~40-line forward/error-handling method
  would have been the wrong call once there were two real proxy controllers needing it — same
  reasoning as generalizing `reserveStockWithRetry` into `retryInventoryCall<T>` in `orders`
  (`docs/decisions/0015`). This is sharing *within* gateway, not across services — doesn't touch
  the root `CLAUDE.md`'s "no code sharing between services" rule.
- **`CatalogProxyController` forwards the query string on `GET /products`** (reading
  `request.originalUrl`), so `?dropId=` keeps working through the proxy exactly as it does calling
  `catalog` directly.
- `CATALOG_URL` (`.env.example`, defaults to `http://localhost:3001`) follows the same pattern as
  the existing `ORDERS_URL`.

## Consequences
- **Verified for real, through the actual proxy, not catalog directly**: started `catalog` and
  `gateway` together and drove real HTTP at `gateway`'s routes — `GET /products` (no auth header
  needed), the `?dropId=` filter, `GET /products/:id`, `GET /drops`, `GET /drops/:id`, and a 404
  for an unknown id, confirming catalog's structured error comes through byte-for-byte. Confirmed
  `orders`' proxy still behaves identically after the `ProxyService` refactor (`GET
  /orders/:orderId` with no token still `401`). Stopped `catalog` and confirmed `gateway` returns a
  clean `503` naming catalog, not a hang. Test data cleaned up afterward.
- 4 new unit tests for `ProxyService` (method/path/body forwarding, Authorization header
  forwarded when present and omitted when absent, the `503` path on a network error) — covers the
  logic now shared by both proxy controllers.
- **Not done**: no caching layer in front of catalog reads, even though they're the kind of
  read-heavy, rarely-changing data a cache would suit well — no evidence yet that it's needed at
  this project's scale.
