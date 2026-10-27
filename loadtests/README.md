# Load tests

A k6 flash-sale spike proving the root `CLAUDE.md`'s core claim: inventory — "the service that
must never oversell" — doesn't oversell stock when hit by a burst of real concurrent buyers. Full
reasoning (why this hits `inventory`'s gRPC server directly instead of going through the whole
`gateway → orders → inventory` saga, why each VU gets its own `order_id`, why k6 over something
else) in [`docs/decisions/0020`](../docs/decisions/0020-k6-load-tests.md).

## Prerequisites

- `docker compose up -d` (needs `inventory-db` and `redis` healthy)
- `inventory` running: `pnpm --filter inventory run start:dev`
- Docker, to run k6 itself (`grafana/k6` image — no native k6 install needed)

## Running it

```sh
# 1. Seed a dedicated product with limited stock (default: 50 units).
node loadtests/seed.js

# 2. Restart inventory so it reseeds Redis's stock:{productId} counter from that row —
#    ReservationService only does this reseed on boot (see services/inventory/CLAUDE.md),
#    so a freshly-created Stock row is invisible to a reservation attempt until it does.
#    (Ctrl+C the running `pnpm start:dev`, then run it again.)

# 3. Run the spike — 300 virtual users (buyers), each attempting to reserve exactly 1 unit,
#    all launched as close to simultaneously as k6 can manage.
docker run --rm -i \
  --add-host=host.docker.internal:host-gateway \
  -v "$(pwd):/repo" -w /repo/loadtests \
  -e VUS=300 \
  grafana/k6:0.54.0 run flash-sale.js

# 4. Verify against the REAL database state, not k6's own self-reported counters.
node loadtests/verify.js

# 5. Clean up, then restart inventory again so Redis forgets this product.
node loadtests/cleanup.js
```

On Windows Git Bash, prefix step 3 with `MSYS_NO_PATHCONV=1` — otherwise bash mangles the
container's `/repo` path into a Windows path before Docker ever sees it.

`VUS` and `LOADTEST_STOCK_QUANTITY` (env var for `seed.js`, default `50`) can both be changed —
try `VUS=50` against the default stock to see an all-success run, or `VUS=1000` to push the
spike harder.

## What a run actually proves

Running it as documented (`VUS=300` against the default 50-unit stock) produced, against the real
running service:

```
flash_sale_reserved......: 50
flash_sale_out_of_stock...: 250
```

— 300 concurrent attempts, exactly 50 succeeded, 250 correctly turned away, confirmed independently
against Postgres and Redis by `verify.js` (not just trusting k6's own counters, which only prove
what the client observed, not what the database actually recorded):

```
RESERVED: sum quantity = 50
OUT_OF_STOCK: 250
PASS: reserved 50 <= stock 50, never oversold
```

No partial reservations, no double-counted stock, no race condition slipping two buyers past the
last unit — the atomic Redis Lua script (`docs/decisions/0011`) holds under real concurrent load,
not just in the sequential testing every other session's manual verification has used so far.
