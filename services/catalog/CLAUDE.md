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

Read routes (no auth guard — product/drop browsing is public, matching how an unauthenticated
storefront would work): `GET /products` (optional `?dropId=` filter), `GET /products/:id`,
`GET /drops` (each annotated with its derived `status` and its `products`), `GET /drops/:id`.

Write routes (admin-only — `JwtAuthGuard` + `RolesGuard` + `@Roles('admin')`): `POST /drops`,
`PATCH /drops/:id`, `POST /products`, `PATCH /products/:id`, `DELETE /products/:id`, plus
`POST /products/upload-url` (presigned S3 upload for product images). `PATCH` has true
partial-update semantics — a field absent from the body is left untouched, an explicit `null` on
a nullable field clears it. Full reasoning in
[`docs/decisions/0029`](../../docs/decisions/0029-catalog-admin-write.md),
[`0030`](../../docs/decisions/0030-product-image-uploads-s3.md),
[`0031`](../../docs/decisions/0031-catalog-edit-support.md), and
[`0032`](../../docs/decisions/0032-catalog-product-delete.md).

**Verified for real** against the live `catalog-db`: seeded a live drop, an upcoming drop, a
scheduled product, and an unscheduled one directly via Prisma, then hit every route over real HTTP
— confirmed the `dropId` filter, the nested `products` on `GET /drops`, `LIVE` vs `UPCOMING` status
computed correctly against real timestamps, `null` `dropId` on the unscheduled product, and a clean
structured `404` (via the existing `AllExceptionsFilter`) for an unknown id. Test data cleaned up
afterward.

`gateway` proxies every route above (`docs/decisions/0018`, `0029`). There's still no delete for
`Drop` — not asked for, and deleting a drop a product is currently assigned to would need a real
decision about what happens to those products (`onDelete: SetNull` already clears their `dropId`,
so nothing would break, but the admin UI has no affordance for it yet).

**`GET /metrics`** (Prometheus text format): default process metrics plus
`http_request_duration_seconds`. No business-specific counters here — the HTTP histogram is the
whole signal for a read-only service. Full reasoning in
[`docs/decisions/0019`](../../docs/decisions/0019-prometheus-metrics.md).

## Events
Produces: none yet.
Consumes: none yet.

## Data ownership
`catalog-db` (Postgres, port `5433` locally): `Product`, `Drop`.

## Port
`3001` (see `.env.example`).
