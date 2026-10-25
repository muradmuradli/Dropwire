# catalog

## Responsibility
Owns products and drops (what's for sale, when a drop opens/closes, pricing). Read-heavy; the
inventory service, not catalog, is the source of truth for available stock — `productId` here is
just a string, referenced with no FK by `inventory`'s `Stock`/`Reservation` rows, same as there.

**Real `Product`/`Drop` models and a read-only API are implemented** (`src/catalog/`): a `Drop` is
a time-boxed sale event (`opensAt`/`closesAt`) that has many `Product`s; a `Product` can exist with
no `Drop` yet (nullable `dropId`). `priceCents` is a plain `Int`, not a `Decimal`/`Float` — exact,
no floating-point rounding on money. A `Drop`'s `status` (`UPCOMING`/`LIVE`/`ENDED`) is deliberately
**not** a stored column — `CatalogService` derives it from `opensAt`/`closesAt` against the current
time on every read, since storing it would need a background job just to flip a value that's
already fully determined by two timestamps. Full reasoning in
[`docs/decisions/0017`](../../docs/decisions/0017-catalog-product-drop-model.md).

Routes (no auth guard — product/drop browsing is public, matching how an unauthenticated storefront
would work): `GET /products` (optional `?dropId=` filter), `GET /products/:id`, `GET /drops`
(each annotated with its derived `status` and its `products`), `GET /drops/:id`.

**Verified for real** against the live `catalog-db`: seeded a live drop, an upcoming drop, a
scheduled product, and an unscheduled one directly via Prisma, then hit every route over real HTTP
— confirmed the `dropId` filter, the nested `products` on `GET /drops`, `LIVE` vs `UPCOMING` status
computed correctly against real timestamps, `null` `dropId` on the unscheduled product, and a clean
structured `404` (via the existing `AllExceptionsFilter`) for an unknown id. Test data cleaned up
afterward.

**Not done**: `gateway` doesn't proxy to these routes yet (still only proxies to `orders`) — a
separate, later step. No write endpoints (`POST`/`PATCH` for products/drops) either; nothing yet
needs to create catalog data outside of a seed/migration, so there's no real requirement driving
their design.

## Events
Produces: none yet.
Consumes: none yet.

## Data ownership
`catalog-db` (Postgres, port `5433` locally): `Product`, `Drop`.

## Port
`3001` (see `.env.example`).
