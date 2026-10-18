# proto

`dropwire/inventory/v1/inventory.proto` — the inventory reservation gRPC contract
(`service InventoryService { rpc ReserveStock(...) }`). See `notes/LEARNING.md` (§6) for what a
`.proto` file is and what it's for, and `docs/decisions/0007-inventory-reservation-contract.md`
for why it's shaped the way it is.

Files live under `dropwire/<package-path>/` rather than flat in this directory, and each
package is suffixed `.v1` — both required by `buf lint`'s default rules (`PACKAGE_DIRECTORY_MATCH`,
`PACKAGE_VERSION_SUFFIX`): the file's directory must mirror its `package` declaration, one
directory segment per dot.
