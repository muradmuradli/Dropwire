# 0027: A separate admin app, starting with the Reservation-Failed worklist

## Context
Two real gaps motivated this: `catalog` has no write endpoints at all (every drop/product only
exists via manual seed scripts run by hand during verification), and orders that land in
`RESERVATION_FAILED` ([0012](0012-order-placement-partial-failure.md) — inventory was unreachable,
not a business decline) just sit there forever with no one able to notice or act on them. Both need
an internal, admin-only surface.

A throwaway Lovable mockup was generated first to explore the shape of an admin console, but came
back too generic to be worth adapting — building directly against the real backend, in this
project's own established patterns, turned out more useful than porting a mock.

**This pass**: a new deployable app, `apps/admin`, and its first real feature end-to-end — the
Reservation-Failed worklist, with retry/cancel actions. Catalog admin-write (drops/products
creation) is an explicit follow-up, not built here, so this stays one reviewable change — a new app,
a new Keycloak client, and new admin-gated backend routes, proven working together before a second
feature is added on top.

## Decision
- **A separate deployable app, not a `/admin` section inside `apps/web`.** The admin surface has a
  different trust boundary and a different audience from the public storefront — in a real
  deployment it would sit behind its own network boundary (VPN/allowlist), not ship any of its code
  to customer browsers, and could be taken down independently. A route inside `apps/web` would get
  none of that for free.
- **A new Keycloak client, `dropwire-admin`** (public PKCE, same shape as `dropwire-web`), bound to
  its own origin (`http://localhost:3101`) — a genuinely separate app gets its own client
  registration, the same way a real second application would be onboarded. No realm/role changes
  needed: `admin`/`customer` roles and the `admin1` test user already existed.
- **`apps/admin` reuses the storefront's whole design system verbatim** (oklch theme tokens,
  dark-mode default, Manrope/Bricolage/JetBrains Mono, shadcn new-york/slate) rather than inventing
  a distinct look — least new surface for the same result, consistent with how this project reuses
  patterns everywhere else.
- **No shared package between `apps/web` and `apps/admin`** — each has its own copy of
  `auth-context.tsx`/`use-require-auth.ts`/`api-client.ts`/etc., pointed at its own Keycloak client.
  Same principle already applied between `gateway` and `orders` (each has its own `JwtStrategy`).
- **A dedicated `/admin/orders` namespace in `orders`**, not a query-param flag on the existing
  `GET /orders` — the worklist is a structurally different query (cross-customer, filtered by
  status) with a different authorization model (role, not ownership) from the customer-facing route.
  `AdminOrdersController` is a separate controller for exactly that reason; `gateway` mirrors the
  split with its own separate `AdminOrdersProxyController`.
- **`orders` gained `RolesGuard`/`@Roles`**, copied verbatim from `gateway`'s
  `src/auth/roles.guard.ts`/`roles.decorator.ts` — `orders` simply never needed role checks before
  this.
- **Retry vs. cancel match the real semantics exactly**: retry re-attempts the same `ReserveStock`
  call `placeOrder` already made (safe because it's idempotent on `orderId`,
  [0007](0007-inventory-reservation-contract.md)/[0011](0011-inventory-reservation-idempotency.md))
  and the order moves to whatever inventory actually says — `RESERVED`, `CANCELLED`, or, if
  inventory is still unreachable, it simply stays `RESERVATION_FAILED` (returned, not thrown — a
  retry that doesn't resolve yet isn't a system error). Cancel marks the order `CANCELLED` directly
  with **no** `ReleaseStock` call — nothing was ever reserved for a `RESERVATION_FAILED` order, so
  there's nothing to release. Both are guarded to only act on an order genuinely still
  `RESERVATION_FAILED` (`409 Conflict` otherwise), and cancel uses the same conditional-`updateMany`
  idempotency shape as the existing `PaymentFailed` handler, so a double-click is a safe no-op.
- **`gateway`'s CORS allowlist grows to two origins** (`WEB_ORIGIN`, new `ADMIN_ORIGIN`) — the only
  change `gateway` needed to let a second frontend origin call it at all.
- **The admin role check in the UI is just UX, not the security boundary** — `OrdersWorklist`/
  `Dashboard` read the token's roles client-side to show an "access denied" state for a
  `customer`-only login, but the real enforcement is the backend's `RolesGuard`, verified
  independently by both `gateway` and `orders` (zero trust, same as everywhere else in this
  project).

## Consequences
- **Verified for real against the live running stack**: a new e2e test
  (`services/orders/test/admin-orders.e2e-spec.ts`, same throwaway-fake-JWKS technique as
  `orders-history.e2e-spec.ts`) covers the role gate (`401`/`403`) on all three routes, the default
  status filter, an unknown-status `400`, cancel's full success path (including the
  `OrderCancelled` outbox write and confirming `ReleaseStock` is never called), the `409` guard on a
  non-`RESERVATION_FAILED` order, and a `404` for an unknown order. `retryReservation`'s three gRPC
  outcomes are covered by unit tests with a mocked inventory client instead — exercising a real
  successful retry needs a real reachable product+stock, which is a live-verification concern, not
  this test's job.
- Logged into `apps/admin` as `admin1` via the real PKCE flow against the new `dropwire-admin`
  client, confirmed the dashboard and worklist both load; logged in as `customer1` and confirmed
  both show the access-denied state (the backend independently returns real `403`s for the same
  calls).
- **Not done, deliberately**: catalog admin-write (drops/products creation) — the other half of the
  original motivation, tracked separately as the next piece of work, not bundled into this change.
