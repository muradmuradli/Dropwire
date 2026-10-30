# 0033: Delete support for drops

## Context
`docs/decisions/0032` added product delete and deliberately left drops alone, since drops raise
one extra question products don't: a drop can have products assigned to it. This closes that gap
— `DELETE /drops/:id` on `catalog`, a `gateway` proxy, and a delete button in `apps/admin`'s drops
page.

## Decision
- **Deleting a drop unassigns its products, it doesn't delete them** — the schema already encodes
  this (`Product.drop` is `onDelete: SetNull`), so `deleteDrop` is exactly the same shape as
  `deleteProduct`: load the row, `404` if it's missing, `prisma.drop.delete`. No application-level
  logic needed to handle the products; Postgres does it.
- **The confirmation modal names the count** when it's non-zero — `"X" will be permanently
  deleted... N products assigned to it will become unassigned, not deleted` — rather than a
  generic warning, since "unassigned" and "deleted" are different enough outcomes that an admin
  deleting a drop with live products in it should see the distinction before confirming. The count
  comes from the `products` array the drops list already carries (`GET /drops` returns each drop
  with its `products`, per `docs/decisions/0017`) — no new backend field needed.
- Same `204`/admin-guard/`AlertDialog`-confirmation shape as `0032` otherwise.

## Consequences
- New unit tests for `deleteDrop` (mocked Prisma): not-found, and the real delete call.
- `test/admin-write.e2e-spec.ts` gained a `DELETE /drops/:id` suite against the real `catalog-db`:
  the role gate, not-found, a real delete confirmed gone by a follow-up `GET`, and — the one case
  worth a real integration test rather than trusting the schema comment — deleting a drop with a
  product assigned to it, then confirming that product's `dropId` came back `null` rather than the
  product disappearing too.
- `services/catalog/CLAUDE.md`'s note about drops having no delete is now out of date; removed.
