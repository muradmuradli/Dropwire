# Contracts

The only thing services are allowed to depend on across service boundaries — never each other's
source code, never a shared runtime package. The plan is: gRPC `.proto` files for synchronous
calls, JSON Schema for Kafka events, types generated from both into each consuming service's
`src/generated/`.

- `proto/` — gRPC service definitions (e.g. inventory's `ReserveStock`). Empty for now.
- `events/` — JSON Schema for saga events. Empty for now.
- `openapi/` — HTTP API shape for the gateway (filled in as routes are implemented).

Nothing has been drafted here yet on purpose — this project is a learning exercise, and designing
the actual contracts (what fields a reservation request needs, what an `OrderPlaced` event looks
like) is part of the learning, not something to generate upfront. See `notes/LEARNING.md` for the
concepts (gRPC, Kafka, events) before writing anything in these folders.
