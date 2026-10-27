# 0020: k6 load test hits inventory's gRPC server directly, not the full saga

## Context
The root `CLAUDE.md` states the project's actual engineering goal in its first paragraph: "never
oversell stock under heavy concurrent load." Every verification done in every session so far —
including inventory's own original reservation-logic session (`docs/decisions/0011`) — has only
ever driven that logic with sequential requests, one at a time. Sequential requests can never
exercise the actual race condition the Redis Lua script exists to prevent (two reservations
reading the same "N units left" and both deciding they fit). This was the one claim in the whole
project that had never actually been tested the way it's phrased.

## Decision
- **The load test calls `inventory`'s gRPC `ReserveStock` directly**, not `POST /orders` through
  `gateway`. `inventory` is explicitly named the service that "must never oversell"
  (`services/inventory/CLAUDE.md`); `orders`/`payments`/`notifications`/Kafka/auth sit around that
  guarantee but don't affect whether it holds. Routing through the whole saga would mean minting a
  JWT for every virtual user (needing a throwaway JWKS server kept alive for the test's duration,
  the same technique used for live verification elsewhere this project) and paying for Postgres
  writes in three other services' databases and a full Kafka round-trip per request — none of
  which has anything to do with the actual question being asked. Testing at the real boundary that
  owns the invariant is a tighter, more honest test than testing the whole system and hoping the
  result says something about one piece of it.
- **k6, run via the `grafana/k6` Docker image** — no native k6 install needed, and it's the same
  "run infrastructure via Docker" pattern already used for Postgres/Redis/Redpanda/Keycloak/
  Prometheus/Grafana. k6's `k6/net/grpc` module loads `contracts/proto/dropwire/inventory/v1/
  inventory.proto` directly and makes real unary gRPC calls — the actual wire protocol `orders`
  itself uses, not an HTTP stand-in for it.
- **One VU, one iteration, one `order_id` each** (`executor: 'per-vu-iterations'`, `iterations: 1`).
  This maps directly onto "N distinct real buyers all click buy at roughly the same instant" —
  the scenario the project's name and premise (a flash sale) is actually about. Each VU generates
  its own `order_id`; reusing one across VUs would just make every VU replay one cached idempotent
  result (`docs/decisions/0011`) instead of genuinely contending for the same stock, which would
  make the whole test measure nothing.
- **A separate, dedicated test product** (`loadtest-flash-sale-product`, seeded by `seed.js` with a
  small stock count, default 50) rather than reusing `p1`/`p2`. Keeps the test's own data entirely
  separate from whatever fixtures exist for manual testing, and a small stock count relative to the
  VU count is what actually puts the race condition under real pressure — 300 VUs against 50 units
  guarantees heavy contention over the last few, not 300 VUs that all trivially succeed.
- **Verification reads Postgres/Redis directly (`verify.js`), never trusts k6's own counters.**
  k6's custom `Counter` metrics only prove what the *client* observed in each response — a real
  assertion about whether the system actually oversold has to come from the same durable state the
  rest of this project already treats as the source of truth (`Stock`/`ReservationItem` in
  Postgres, the live Redis counter), matching the "verify for real, not from the client's own
  account of what happened" discipline used in every other session's manual verification.

## Consequences
- **Verified for real against the live running service**: seeded a 50-unit product, restarted
  `inventory` so Redis reseeded from it, then ran 300 concurrent VUs. Result: exactly 50
  `RESERVED` and 250 `OUT_OF_STOCK`, zero unexpected responses, all gRPC calls returned `OK` status
  — confirmed independently via `verify.js` reading the real `ReservationItem` rows (sum of
  `RESERVED` quantities = 50, exactly matching `Stock.totalQuantity`, not merely under it) and via
  Redis's live counter (drained to exactly `0`). No overselling, no under-reservation, no
  inconsistency between Postgres and Redis after the spike.
- 300 real concurrent gRPC calls completed in well under a second against a single `inventory`
  process — the atomic Lua script holds up under load this project had never actually generated
  before this session.
- **Not done**: this test only covers `ReserveStock` contention (the actual overselling risk).
  `ReleaseStock` under concurrent cancellations, and the full saga's end-to-end latency under load
  (as opposed to inventory's own gRPC latency in isolation), are both out of scope for this pass —
  nothing in the root `CLAUDE.md`'s stated goal requires them, and adding them now would be testing
  hypothetical failure modes nobody's asked about yet.
