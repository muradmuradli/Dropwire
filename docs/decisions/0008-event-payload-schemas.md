# 0008: Saga event payload schemas

## Context
`docs/event-catalog.md` already fixed the envelope (`id`/`type`/`version`/`occurredAt`/
`correlationId`/`payload`) and the 7 topics/producer/consumer pairs for the saga. What it left
open was the shape of each event's `payload` — the actual JSON Schema files in
`contracts/events/`. Three decisions needed to be made deliberately:

1. The envelope is identical across all 7 events. Duplicate it into every schema file, or extract
   it once?
2. `inventory.proto` ([0007](0007-inventory-reservation-contract.md)) uses snake_case, matching
   protobuf convention. The envelope example in `event-catalog.md` already uses camelCase. Which
   convention do the JSON payloads use?
3. `payments` consumes `InventoryReserved` directly (per the catalog's producer/consumer table),
   not a synchronous call from `orders` — so what does it use to decide what to charge?

## Decision
- **Shared envelope via `$ref`**: `contracts/events/envelope.schema.json` defines the common
  fields once. Each of the 7 event schemas combines it with its own payload via `allOf`
  (`[{ $ref: envelope.schema.json }, { properties: { type: { const: ... }, payload: {...} } }]`),
  narrowing `type` to a `const` and `payload` to its own object shape. A shared
  `order-item.schema.json` (`{ productId, quantity }`) is extracted the same way for the three
  payloads that carry line items, rather than repeating that shape three times.
- **camelCase**, matching the envelope fields already fixed in `event-catalog.md`
  (`occurredAt`, `correlationId`) and how NestJS/TS consumers naturally read JSON. This means the
  JSON event payloads and the gRPC proto messages use different casing conventions — accepted,
  since each follows its own ecosystem's norm rather than forcing one convention across a format
  boundary that already has to be translated at the code level either way.
- **Pricing is out of scope for now.** `PaymentConfirmed`/`PaymentFailed` carry no amount or
  currency. `payments` is a mocked provider with a configurable failure rate (see
  `services/payments/CLAUDE.md`) — it doesn't need a real price to simulate an outcome. Computing
  and carrying a real total would require a catalog pricing contract that doesn't exist yet;
  that's a separate decision for whenever catalog integration is designed, not something to bolt
  onto the saga events preemptively.
- **`customerId` lives only on the events `orders` produces** (`OrderPlaced`, `OrderConfirmed`,
  `OrderCancelled`), not on the inventory events. Inventory has no customer concept anywhere else
  in its design (not in `inventory.proto`, not in its own domain) — keeping it off
  `InventoryReserved`/`InventoryReleased` matches that. `customerId` is the JWT `sub` claim (see
  `docs/auth.md`), consistent with "no local user tables" applying here too.
- **Inventory events carry `items`, not just `orderId`.** With no shared database between services
  (ADR 0004), a consumer that needs to know what an order contained reads it from the event
  itself rather than calling back to `orders`. `InventoryReleased` carries what was released, not
  why — the reason a release was triggered lives on the `PaymentFailed` that caused it.

## Consequences
- Changing a field every event shares (e.g. adding a `source` field to the envelope) means editing
  one file, not seven.
- `payload` is intentionally untyped (`{}`) in the envelope schema itself — each concrete event
  schema is responsible for constraining it. A schema validator pointed only at
  `envelope.schema.json` would accept any payload shape; that's expected, not a gap.
- Revisiting pricing later (once catalog has a contract) means adding fields to
  `PaymentConfirmed`/`PaymentFailed` (and possibly `OrderPlaced`/`InventoryReserved`, if the total
  needs to travel earlier) — an additive, versioned change per the envelope's own `version` field,
  not a rework of what's defined now.
- Codegen (`json-schema-to-typescript`) needs to resolve the relative `$ref`s between these files
  when it's set up next — not yet configured, tracked in `notes/PROGRESS.md`.
