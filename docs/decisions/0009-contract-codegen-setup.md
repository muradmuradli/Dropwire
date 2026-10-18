# 0009: Contract codegen setup

## Context
`contracts/proto/dropwire/inventory/v1/inventory.proto` ([0007](0007-inventory-reservation-contract.md)) and the 7 event
JSON Schemas ([0008](0008-event-payload-schemas.md)) existed as design artifacts, but nothing
generated TypeScript from them yet. Per the root `CLAUDE.md` rule, generated types must land in
each *consuming* service's own `src/generated/` (gitignored), never a shared runtime package — so
setting this up means deciding which services get which generated files, and getting two codegen
tools (`ts-proto` for the proto, `json-schema-to-typescript` for the event schemas) actually
working on this stack (Windows, pnpm, NestJS v11).

## Decision
- **Tools**: `ts-proto` (+ `grpc-tools` for a bundled `protoc` binary, so no separate system
  install is needed) for the gRPC contract; `json-schema-to-typescript` for the event schemas.
  Both added as root devDependencies (shared tooling, same pattern as `eslint`/`jest` — see
  `LEARNING.md` §2), invoked by one script: `scripts/gen-contracts.js`, run via
  `pnpm run gen:contracts` (or `gen:contracts:proto` / `gen:contracts:events` separately).
- **Generation targets are precise per-service subsets, not "generate everything everywhere."**
  A service gets a generated file only if it's the producer *or* a consumer of that event, per
  `docs/event-catalog.md`'s own table — computed once in `gen-contracts.js`'s
  `EVENT_CONSUMERS` map. Concretely: `orders` gets all 7 event types (it touches every step of
  the saga it orchestrates), `inventory` gets 3, `payments` gets 3, `notifications` gets 2. The
  gRPC contract goes to exactly the two services on that edge: `inventory` (server) and `orders`
  (client). Generating all 7 event types into every service would have been simpler to write, but
  would leave each service importing types for events it never actually touches — dead code with
  no caller, for no benefit.
- **`ts_proto_opt=nestJs=true,outputServices=grpc-js`**: generates NestJS-flavored output
  (`@GrpcMethod` decorators, a `*ControllerMethods()` decorator factory) rather than plain
  protobuf bindings, since every service here already is a NestJS app. This pulls in three new
  runtime dependencies wherever the generated proto file lands (`inventory`, `orders`):
  `@bufbuild/protobuf` (the actual message encode/decode the generated code calls),
  `@grpc/grpc-js` (gRPC transport types), `@nestjs/microservices` (the decorators). All three
  pinned to versions compatible with this project's NestJS v11 line — `pnpm add` initially
  resolved `@nestjs/microservices` to `^12.2.0`, which was corrected to `^11.2.8` by hand; mixing
  a v12 package into an otherwise-v11 NestJS app risks exactly the kind of incompatibility the
  v11 pin (see `PROGRESS.md`'s assumptions section) exists to avoid.
- **ts-proto's output is camelCase** (`orderId`, not `order_id`) despite the `.proto` source
  using snake_case — ts-proto does this conversion automatically. This means the generated gRPC
  types and the generated event types end up in the *same* casing convention in actual TypeScript
  code, even though the two source formats (`.proto` vs JSON Schema) deliberately use different
  conventions (ADR 0008) — the inconsistency lives only in the source files, not in what either
  service actually imports and uses.
- **Windows-specific fix, verified empirically rather than assumed**: `protoc` (a native binary)
  spawning the `ts-proto` plugin's `.cmd` shim fails outright without `shell: true`, and `shell:
  true` itself only works with an *absolute* path to the shim (a relative path produced
  `'node_modules' is not recognized as an internal or external command`). Both were confirmed by
  running the exact failing/working invocations directly before writing them into the script.
  Every argument passed under `shell: true` is a fixed, internally-built string — no external
  input ever reaches this call — so there's no injection surface despite the shell's lack of
  argument escaping.

## Consequences
- Running `pnpm run gen:contracts` after editing any contract regenerates all affected files.
  Re-running it is non-destructive to anything else — each target directory is wiped and
  rewritten from scratch (`cleanDir`), so a schema field removed upstream can't leave a stale
  generated field behind.
- Verified end-to-end, not just "ran without error": `pnpm --filter <service> run build` and
  `run lint` were run against all four affected services (`inventory`, `orders`, `payments`,
  `notifications`) after generation, with the new dependencies installed — all four build and
  lint clean (`src/generated/**` was already excluded from lint in `eslint.config.mjs` from
  scaffolding). A standalone `tsc --strict` check confirmed the generated `OrderPlaced` type
  genuinely rejects an object missing required fields, not just that it compiles.
- **Known, accepted artifact**: each event's generated file independently re-declares its own
  copy of the `EventEnvelope` and `OrderItem` interfaces (`json-schema-to-typescript` inlines
  `$ref`-ed schemas per output file rather than emitting shared imports across files). A service
  consuming 3 event types ends up with 3 structurally-identical copies of `EventEnvelope` in its
  `src/generated/events/`. Harmless — TypeScript's structural typing treats them as
  interchangeable, and the files are regenerated wholesale, never hand-edited — but worth knowing
  about rather than being surprised by it later.
- Also worth knowing: the `allOf`-combined part of each event's output (the branch narrowing
  `type` to a `const` and `payload` to its own shape) renders `type?`/`payload?` as optional and
  adds a `[k: string]: unknown` index signature, on their own. This looked like a bug until
  checked directly — the intersection with `EventEnvelope` (which has no index signature and
  marks both fields as required) still makes the combined type correctly require them; verified
  with the `tsc --strict` check above, not assumed from reading the output.
- Nothing yet reads or writes these generated types from real business logic — no gRPC
  server/client implementation, no Kafka producer/consumer. That's the next layer of work, now
  unblocked by this one.
