# 0017: Catalog's Product/Drop model

## Context
`catalog` owns "products and drops (what's for sale, when a drop opens/closes, pricing)" per the
root `CLAUDE.md`, but had only ever had a placeholder `HealthCheck` model. This is the first real
domain data in the service, and needed three real decisions: how `Product` and `Drop` relate, how
to represent money, and how to represent a drop's current phase (upcoming/live/ended).

## Decision
- **A `Drop` has many `Product`s, not a many-to-many join.** A drop is a time-boxed sale event
  (`opensAt`/`closesAt`) that bundles the products released in it — the common "limited drop" shape
  this project is modeling. `Product.dropId` is nullable: a product can exist before being
  scheduled into a drop, and `onDelete: SetNull` keeps the product around (not cascaded away) if
  its drop is ever deleted. A many-to-many join table was considered (a product re-released across
  multiple drops) but rejected as unneeded complexity with no current use case driving it.
- **`priceCents` is a plain `Int`, not `Decimal`/`Float`.** Exact, no floating-point rounding on
  money, and consistent with how every other service already treats quantities (plain ints, no
  fractional units) — no new numeric-type convention introduced.
- **A drop's `status` (`UPCOMING`/`LIVE`/`ENDED`) is derived, not a stored column.**
  `CatalogService.dropStatus` computes it from `opensAt`/`closesAt` against `new Date()` on every
  read. Storing it would mean running a background job just to flip a value on schedule — for
  something that's already fully and cheaply determined by two timestamps already on the row.
- **No auth guard on any catalog route.** Browsing products/drops is a public storefront action in
  any real e-commerce platform — there's no notion of "whose product is this" the way there is for
  orders. `inventory`/`orders` still don't trust catalog data for anything stock-related; this is
  read-only product/drop info only.
- **Read-only for now — no `POST`/`PATCH` routes.** Nothing in the system yet needs to create or
  change catalog data outside of direct seeding, so there's no real requirement to design a write
  API against. Added when something actually needs it (an admin UI, most likely).

## Consequences
- `productId` across the system (`inventory`'s `Stock`/`Reservation`, `orders`' `OrderItem`) stays
  a plain string with no FK to `catalog` — unchanged, matches the existing "no shared database"
  rule and the string-keyed contract already in place.
- **Verified for real against the live `catalog-db`**: seeded a live drop, an upcoming drop, a
  product scheduled into the live drop, and an unscheduled product, directly via Prisma against the
  running service. Then hit every route over real HTTP: `GET /products` and `GET
  /products?dropId=<live>` (filter works, unscheduled product correctly excluded), `GET
  /products/:id` and a 404 for an unknown id (structured via the existing `AllExceptionsFilter`),
  `GET /drops` and `GET /drops/:id` (both correctly show `LIVE` for the live drop and `UPCOMING` for
  the future one, with nested `products`, and `dropId: null` on the unscheduled product). Test data
  cleaned up afterward.
- 9 new unit tests for `CatalogService`, covering both derived-status boundaries (`UPCOMING` just
  before `opensAt`, `ENDED` at exactly `closesAt`, `LIVE` in between) plus the `dropId`-filter and
  not-found paths.
- **Not done**: `gateway` doesn't proxy to these routes yet — flagged as its own separate step in
  `notes/PROGRESS.md`, not bundled into this pass.
