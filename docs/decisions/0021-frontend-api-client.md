# 0021: Frontend API client — plain functions for catalog, a hook for orders

## Context
First real step of wiring `apps/web` to the actual backend (rather than Lovable's
`proj/dropwire-live` reference, which is pure client-side simulation with no backend at all):
typed functions for the only two services the frontend will ever call directly, `catalog` and
`orders`, both reached through `gateway`.

## Decision
- **`catalog-api.ts` exports plain async functions, not a hook.** Catalog's own routes have no
  auth guard (`docs/decisions/0017`), so there's no token to inject — depending on a hook (and
  therefore on Keycloak being initialized) to browse products would be an invented requirement.
  Plain functions also work from Next.js Server Components, not just Client Components.
- **`orders-api.ts` exports a hook, `useOrdersApi()`,** built on the existing `useApiClient()`
  (which attaches a freshly-refreshed bearer token). Every `orders` route requires a verified
  JWT, so this one genuinely needs to be called from inside a component tree with `AuthProvider`
  above it.
- **Types mirror the real backend's actual JSON exactly**, not the reference project's flattened
  `Drop extends Product` shape: `Product`/`Drop` (catalog) and `Order`/`OrderItem`/
  `PlaceOrderResult` (orders) each match field-for-field, including `priceCents` as a number (not
  dollars) and `dropId`/`description` as nullable.
- **One shared error-envelope parser** (`api-error.ts`, `throwIfNotOk`) for both clients — every
  service wraps a thrown error the same way (root `CLAUDE.md`), but `message` is sometimes a
  plain string and sometimes Nest's own nested `{ message, error, statusCode }` object (e.g. a
  bare `NotFoundException`). Normalizes both into one readable `ApiError.message` rather than
  each call site guessing. This is sharing *within* one frontend app, not across backend
  services — doesn't touch the root `CLAUDE.md`'s "no code sharing between services" rule.

## Consequences
- **Found and fixed a real bug during verification**: `API_BASE_URL` was originally a plain
  string constant exported from `api-client.ts`, which is marked `'use client'`. Importing it
  into a Server Component (to test `catalog-api.ts` without needing a browser) failed with
  `"Attempted to call API_BASE_URL() from the server but API_BASE_URL is on the client"` — Next's
  RSC bundler proxies *every* export of a `'use client'` module into a client-only reference,
  even a plain string, not just functions/components. Fixed by moving it into a new
  `config.ts` with no directive at all, importable from either side.
- **Verified for real, against the live running backend**: a temporary Server Component page
  (removed afterward) exercised `listDrops`/`getDrop`/`listProducts`/`getProduct` against real
  seeded catalog data, including the 404 path (confirmed `ApiError`'s message comes out as the
  clean inner string, not the raw nested object). `orders-api.ts`'s types were verified by
  POSTing/GETting against a running `orders` directly with a throwaway fake-JWKS token (same
  technique as prior sessions) — `PlaceOrderResult`/`Order` matched the real response
  field-for-field with no adjustment needed. `useApiClient()`'s own auth plumbing wasn't
  re-tested here since it's already proven working end-to-end (`/account` page, prior session).
- **Not done yet**: no actual pages consume these clients — this was deliberately just the data
  layer, the first of several steps toward the customer-facing flow (home/drops → product detail
  → cart/checkout → order tracking).
