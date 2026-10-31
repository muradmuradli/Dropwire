# events

The saga event schemas (`OrderPlaced`, `InventoryReserved`, `PaymentConfirmed`, etc.) — see
`docs/event-catalog.md` for the topic/producer/consumer table and `notes/LEARNING.md` (§8) for
what an event envelope and a JSON Schema are for. Generated into each consuming service's own
`src/generated/events/` via `pnpm gen:contracts:events` (`scripts/gen-contracts.js`) — never a
shared runtime package, per the repo root `CLAUDE.md`'s "no code sharing between services" rule.
