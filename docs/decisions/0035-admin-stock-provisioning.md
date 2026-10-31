# 0035: Admin stock provisioning on product create/edit

## Context
Creating a product in `apps/admin` only ever wrote to `catalog-db`. `catalog` and `inventory` are
separate services with separate databases and no shared code or FK between them (`productId` is
just a string on both sides) — and nothing connected the two. `inventory`'s `Stock` rows that
existed were hand-created fixtures from earlier development, never a real provisioning path. The
practical effect: any product created through the admin console had no `Stock` row at all, so a
customer trying to order it got `PRODUCT_NOT_FOUND` from inventory's `ReserveStock` — surfaced to
the storefront as "this item isn't available anymore," which is what led to this fix.

## Decision
- **A new synchronous `POST /stock` endpoint on `inventory`** (admin-only — `inventory` gets its
  own copy of the JWT auth stack for the first time: `src/auth/`, copied verbatim from `catalog`'s,
  per the root `CLAUDE.md`'s "no code sharing between services" rule), proxied through `gateway`
  (`InventoryProxyController` — `inventory`'s only HTTP route reachable by a frontend; every other
  path into it is the gRPC `ReserveStock`/`ReleaseStock` API, called directly by `orders`, not
  through `gateway`). Chosen over an async `ProductCreated` event `inventory` would consume to
  auto-provision stock on its own — that would just shrink the race this bug report *is*, not
  close it (the product would still be briefly orderable with no stock behind it), and would still
  need the quantity to come from somewhere, so it wouldn't even simplify the admin UI.
- **`StockService.setStock` is an upsert, not a strict create.** It also serves as a general
  "set this product's stock to exactly this number" admin action (used from the edit form too, not
  just create), and makes a client retry after a network blip safe rather than a `409`. Writes
  `Stock` in Postgres, then recomputes and overwrites the cached `stock:{productId}` Redis counter
  in the same call — the same `totalQuantity − alreadyReserved` math `ReservationService`'s own
  boot-time reseed uses, scoped to one product, so a re-set stays correct even on a product that
  already has reservations against it, not just a brand-new one.
- **`apps/admin`'s product form gets a "Stock quantity" field** — required on create (there's no
  reasonable default; an admin has to say how many), optional on edit (blank means "leave stock as
  it is"; there's no read endpoint for current stock yet, so the field is never pre-filled, only
  write-only). On create, `createProduct` runs first and `setStock` second, using the id it
  returns — if the second call fails, the first already succeeded, so the error message says
  so explicitly ("created, but setting its stock failed... edit it again to retry") instead of
  sounding like nothing happened, and the list still reloads so the half-provisioned product is
  there to fix. This also happens to be the escape hatch for the already-broken products created
  before this fix shipped: editing one and entering a stock quantity now provisions it for the
  first time, via the same upsert.

## Consequences
- New Prisma migration: none — `Stock` already existed; this only adds a way to write it.
- `inventory` gained its first HTTP auth dependency set (`@nestjs/passport`, `passport`,
  `passport-jwt`, `jwks-rsa`) and `KEYCLOAK_URL`/`KEYCLOAK_REALM` env vars, matching `catalog`'s.
- Unit tests for `StockService` (validation, the upsert, the reserved-quantity subtraction) and
  `StockController`; a new `test/stock-admin-write.e2e-spec.ts` (throwaway-JWKS technique, same as
  every other admin-write suite) verified for real against both `inventory-db` and Redis — the
  role gate, validation, and that a `POST /stock` call actually lands in both stores with the
  right available count.
- Not yet built, not asked for: a read endpoint for current stock (so the edit form could show
  it), and any UI for restocking in bulk — this pass only closes the "brand-new product has no
  stock at all" gap.
