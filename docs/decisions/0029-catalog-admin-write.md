# 0029: Catalog admin-write — POST /drops, POST /products

## Context
`docs/decisions/0017` deliberately left `catalog` read-only — "added when something actually needs
it, an admin UI most likely." `apps/admin` now exists with working Keycloak role-gating
(`docs/decisions/0028`), closing the last piece of the original admin-write motivation
(`notes/PROGRESS.md`): every drop/product so far only ever existed via manual Prisma seed scripts
run by hand during verification.

## Decision
- **`catalog` gets the exact same JWT-auth copy `orders`/`gateway` already have** —
  `JwtStrategy`/`JwtAuthGuard`/`CurrentUser`/`AuthModule`/`RolesGuard`/`@Roles`, same dependency
  pins already fixed once this project (`@nestjs/passport@^11.0.5`, `jwks-rsa` on the `3.x` line,
  not whatever `^` would resolve to today — see `docs/decisions/0026` for why that matters).
  `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('admin')` only on the two new `POST` handlers;
  every existing `GET` route keeps zero guards, unchanged.
- **Validation hand-rolled**, matching `OrdersService.assertValidInput`'s style: `createDrop`
  needs a non-empty `name` and `closesAt` strictly after `opensAt`; `createProduct` needs a
  non-empty `name`, a positive integer `priceCents`, and — if a `dropId` is given — that it
  actually refers to a real `Drop` (`404`, not a silently dangling reference).
- **`gateway`'s `CatalogProxyController` mirrors the same split**: the two new `POST` routes get
  the identical guard chain, forwarded through the existing `ProxyService`; the `GET` routes stay
  unguarded, matching `catalog`'s own public reads.
- **`apps/admin` gets `/drops` and `/products`**, each a list (plain functions against the public
  `GET` routes, no auth needed to read — `lib/catalog-api.ts`, same shape as `apps/web`'s own) plus
  a create form (`lib/admin-catalog-api.ts`, a hook, same shape as `admin-orders-api.ts`), gated by
  the same admin-role check already proven on the worklist page. Price is entered in dollars and
  converted to integer `priceCents` client-side — the wire format stays exact cents, the form just
  speaks the unit a human actually types.
- **Dashboard gained drop/product counts**, closing the "added once those read calls are wired in"
  note left in `components/dashboard.tsx` when the admin app was first scaffolded.

## Consequences
- **Verified for real**: a new e2e test (`services/catalog/test/admin-write.e2e-spec.ts`, same
  throwaway-fake-JWKS technique as every other admin-gated route this project has) covers the role
  gate (`401`/`403`) on both routes, a real `Drop`/`Product` created against the live `catalog-db`,
  the `closesAt`-before-`opensAt` and non-positive-`priceCents` rejections, and the unknown-`dropId`
  `404`. New unit tests for `createDrop`/`createProduct` (mocked Prisma, same style as the rest of
  `catalog.service.spec.ts`).
- Logged into `apps/admin` as `admin1`, created a real drop and a real product (one assigned to
  that drop, one unassigned) through the actual forms, confirmed both show up in their lists and in
  the dashboard counts; confirmed `customer1` still gets the same access-denied state the worklist
  page already had.
- Catalog's public storefront (`apps/web`) is unaffected — its `GET` calls through `gateway` are
  the exact same unguarded routes as before this change.
