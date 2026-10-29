# 0031: Edit support for drops and products

## Context
`apps/admin`'s drop/product forms only created, never edited (`docs/decisions/0029`), deliberately
scoped that way at the time. This adds the missing half: `PATCH /drops/:id`/`PATCH /products/:id`
on `catalog`, a `gateway` proxy, and edit mode in the existing create forms.

## Decision
- **True partial-update semantics.** A field *absent* from the `PATCH` body is left untouched; an
  explicit `null` on a nullable field (`description`, `imageUrl`, `dropId`) clears it. This needed
  `UpdateProductInput` to type those three as `string | null | undefined` specifically — a plain
  optional string can't distinguish "didn't send this" from "sending it as empty," and both are
  real, different things an admin might want to do. `name`/`priceCents`/`opensAt`/`closesAt` are
  never nullable, so for those "present" always just means "replace with this."
- **Validation extracted into small shared private methods** (`assertValidName`,
  `assertValidPriceCents`, the opens/closes-window check, `assertDropExists`) rather than
  duplicated between `createDrop`/`updateDrop` and `createProduct`/`updateProduct`. `updateDrop`/
  `updateProduct` load the existing row, merge in whatever the request provided, then validate the
  *merged* result — editing only `closesAt` still checks it against the row's real stored
  `opensAt`, not a blank one.
- **`updateProduct` only re-checks `dropId` existence when it's actually changing to a new
  non-null value**, not on every update that happens to include an unchanged `dropId` — a drop
  reference already on a product was already confirmed to exist when it was set, and a deleted
  drop clears it to `null` via the schema's `onDelete: SetNull`, so an unchanged non-null `dropId`
  is never dangling. (Caught by a unit test that didn't bother mocking `drop.findUnique` for an
  unrelated field update, and got a real `404` back — worth fixing rather than just fixing the
  test, since the redundant check was real wasted work on every edit.)
- **`gateway` mirrors the same guard on matching `PATCH` routes**, through the existing
  `ProxyService.forward` (already method-agnostic).
- **The admin UI reuses the create form in an "edit mode"** rather than building a second one:
  each list row gets an "Edit" button that populates the form from that row, swaps the heading/
  submit label to "Update", and adds a "Cancel" button. `editingId` going back to `null` returns
  the form to create mode.
- **The product form's image field keeps "upload a new file replaces it, no file leaves it
  alone"** — in edit mode, no file chosen simply omits `imageUrl` from the request entirely
  (existing image untouched); choosing one uploads and replaces it, same as create. No "remove the
  current image" button this pass — not asked for.

## Consequences
- New unit tests for `updateDrop`/`updateProduct` (mocked Prisma): not-found, each validation
  rejection against the merged result, a partial update that only touches one field, explicit-
  `null` clearing `description`/`dropId`, and the dropId-recheck-skipped-when-unchanged case.
- `test/admin-write.e2e-spec.ts` gained `PATCH /drops/:id`/`PATCH /products/:id` suites against the
  real `catalog-db`: the role gate, not-found, and a real partial update confirming untouched
  fields stayed untouched.
- **Verified for real against the live stack**: through `gateway`, a customer token got `403` on
  both `PATCH` routes; an admin token edited a real drop's name only (confirmed `opensAt`/
  `closesAt` unchanged via a direct read) and cleared a real product's `description`/`dropId` via
  explicit `null`. Test data cleaned up afterward.
