# 0032: Delete support for products

## Context
`apps/admin`'s product list had create and edit (`docs/decisions/0029`, `0031`) but no way to
remove a product. This adds `DELETE /products/:id` on `catalog`, a `gateway` proxy, and a
destructive action in the admin UI.

## Decision
- **Hard delete, no soft-delete flag.** `catalog`'s `Product`/`Drop` have no FK from `inventory`
  or `orders` (`productId` is referenced by those services as a plain string, no FK — see
  `services/catalog/CLAUDE.md`), so there's nothing on the Postgres side that can break. A deleted
  product's id simply stops existing in `catalog`; any historical order/reservation rows that
  already captured its name/price at the time stay exactly as they were, independent of whether
  the catalog row still exists. Nothing in this pass needed a "soft delete" column or an
  are-there-live-orders check — there's no real requirement driving that complexity yet.
- **404 before delete**, same shape as `updateProduct` — load the row first so a delete on an
  unknown id gets a clean `404` instead of Prisma's own record-not-found error leaking through.
- **204 No Content** on success — no other route in this codebase has a `DELETE` yet, so there
  was no existing convention to match; this is the standard shape for a delete with nothing useful
  to return.
- **Same admin guard as every other write route** (`JwtAuthGuard` + `RolesGuard` + `@Roles('admin')`),
  mirrored on `gateway`'s proxy through the existing method-agnostic `ProxyService.forward` — no
  changes needed there.
- **The admin UI uses a confirmation modal**, not an inline confirm — a destructive, irreversible
  action gets an explicit second step. Built on Radix's `AlertDialog` (already a dependency via the
  `radix-ui` package) rather than a plain `window.confirm()`, matching the rest of the UI's styling
  and making the async delete-in-progress / error states presentable. The dialog is a single
  instance at the bottom of the products page, controlled by a `pendingDeleteId` id rather than
  one `AlertDialog` per row.

## Consequences
- New unit tests for `deleteProduct` (mocked Prisma): not-found, and the real delete call.
- `test/admin-write.e2e-spec.ts` gained a `DELETE /products/:id` suite against the real
  `catalog-db`: no-token `401`, customer-role `403`, unknown-id `404`, and a real delete confirmed
  by a follow-up `GET` on the same id returning `404`.
- No new `gateway`-level automated test — `catalog-proxy.controller.ts` has never had its own
  e2e suite (every prior route on it, including the existing `PATCH`s, was verified live by hand
  instead); this `DELETE` route is a method-only copy of that same already-proven forwarding path,
  so the same manual-verification bar applies, not a new one.
