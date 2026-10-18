# 0010: Conform `inventory.proto` to buf lint's default conventions

## Context
Running `buf lint` against `contracts/proto/inventory.proto` (as originally written in
[0007](0007-inventory-reservation-contract.md)) surfaced three findings from buf's default rule
set:

1. `PACKAGE_DIRECTORY_MATCH` — a file declaring `package dropwire.inventory;` must live in a
   directory path matching that package, one segment per dot (`dropwire/inventory/`), relative to
   the proto root. The file was flat in `contracts/proto/`.
2. `PACKAGE_VERSION_SUFFIX` — a package name should end in a version component like `.v1`, so a
   later breaking change can ship as a new `dropwire.inventory.v2` package living alongside the
   old one, instead of mutating `dropwire.inventory` in place for every consumer at once.
3. `ENUM_VALUE_PREFIX` — every value in an enum must be prefixed with the enum's name in
   `SCREAMING_SNAKE_CASE`. `ReservationStatus`'s `RESERVED`, `OUT_OF_STOCK`, and
   `PRODUCT_NOT_FOUND` didn't carry the `RESERVATION_STATUS_` prefix that
   `RESERVATION_STATUS_UNSPECIFIED` already had (unprefixed enum value names live in the
   enclosing proto *package's* namespace, not the enum's, in protobuf — this prefix is how you
   avoid two different enums in the same package colliding on a value name like `UNSPECIFIED` or
   `OK`).

These are buf's standard, widely-followed defaults (not something invented for this project), and
there's no reason to diverge from them for a contract nobody outside this repo depends on yet.

## Decision
- Moved the file to `contracts/proto/dropwire/inventory/v1/inventory.proto`.
- Changed `package dropwire.inventory;` to `package dropwire.inventory.v1;`.
- Renamed the three unprefixed enum values: `RESERVED` → `RESERVATION_STATUS_RESERVED`,
  `OUT_OF_STOCK` → `RESERVATION_STATUS_OUT_OF_STOCK`, `PRODUCT_NOT_FOUND` →
  `RESERVATION_STATUS_PRODUCT_NOT_FOUND`.
- `scripts/gen-contracts.js` ([0009](0009-contract-codegen-setup.md)) updated: `--proto_path`
  now points at the proto root (`contracts/proto/`) rather than the file's own directory, so
  `protoc` resolves the package path correctly. This also changed where generated output lands —
  `ts-proto` mirrors the package path under `ts_proto_out`, so the generated file is now at
  `services/<service>/src/generated/proto/dropwire/inventory/v1/inventory.ts`, not flat at
  `.../proto/inventory.ts` as before.

- Added `contracts/proto/buf.yaml` (`version: v1`, no other keys). Without it, `buf lint` has no
  way to know `contracts/proto/` is the actual module root — it falls back to treating wherever
  it's invoked from (or wherever its directory search lands) as the root, which produced a second,
  confusing `PACKAGE_DIRECTORY_MATCH` failure even *after* the file was moved: buf reported the
  file as being in directory `.`, because without this config it had no fixed reference point to
  measure the package-to-directory match against.

## Consequences
- Regenerated and re-verified after the rename: `pnpm run gen:contracts` picks up the new path and
  enum names with no other script changes beyond the `proto_path`/`PROTO_FILE` fix, and
  `pnpm --filter <service> run build`/`run lint` stayed clean on all four affected services.
- Any future second `.proto` file in this project should follow the same
  `dropwire/<service>/v1/<file>.proto` layout from the start, rather than needing this same
  after-the-fact move.
- `buf.yaml` now fixes the module root for anyone running `buf lint` locally, regardless of which
  directory they invoke it from. `buf` still isn't wired into this repo's own tooling beyond that
  — no `buf.gen.yaml`, no `pnpm` script running it, no CI step — so lint is only as reproducible as
  "whoever runs it happens to have the `buf` CLI installed." Formalizing that further is a
  separate decision, not made here.
