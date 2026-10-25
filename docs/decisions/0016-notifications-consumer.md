# 0016: Notifications consumes OrderConfirmed/OrderCancelled with no database

## Context
`notifications` is the saga's last step — logging/"sending" a mock email once an order reaches
`OrderConfirmed` or `OrderCancelled`. Unlike every other Kafka consumer in this codebase
(`inventory`, `payments`, `orders`), it deliberately owns no database at all
(`services/notifications/CLAUDE.md`: "stateless consumer"). The root `CLAUDE.md`'s "idempotent
consumers... dedupe by event id" rule assumes a durable place to record which event ids have
already been handled — which doesn't exist here. This needed a real decision rather than quietly
skipping the rule.

## Decision
- **A bounded in-memory `Map<string, true>`** (capped at 1000 entries, oldest evicted first) tracks
  recently-seen event ids inside `NotificationService`. A duplicate within that window is skipped;
  the cache resets on every process restart.
- **This is an accepted, narrower guarantee than the durable dedup everywhere else, and it's
  acceptable specifically because of what this consumer's side effect actually is**: logging (a
  mock "email send"). Repeating it has no real consequence — unlike `payments` double-charging a
  card or `inventory` double-decrementing stock, there's nothing here an in-memory-only cache needs
  to protect against surviving a restart. Giving `notifications` a database purely to track event
  ids would mean abandoning its one defining property (no owned state) for a guarantee that
  wouldn't actually prevent anything harmful.
- The in-memory cache still catches the common real-world case this project has already seen
  happen (a Kafka redelivery during a consumer-group rebalance, not a full process restart) — so
  it's not purely theoretical, just not crash-proof.

## Consequences
- **Verified for real, the complete saga, all four services, both branches**: ran `inventory`,
  `payments`, and `orders` on the host plus `notifications` as a real container on the actual
  `docker compose` network, and drove two real orders through `POST /orders` to a terminal state
  with zero manual intervention past the initial HTTP call — confirming `notifications` actually
  logged `[mock email] ... is confirmed!` for the happy path and `[mock email] ... was cancelled
  (...)` for the forced-failure path, reading the real decline reason off the real
  `OrderCancelled` message.
- Same mutation-sanity check as every other consumer this session: broke the dedup check by hand,
  confirmed the right test failed for the right reason, reverted.
- This closes the saga end-to-end for the first time — every service from `orders` placing an
  order through to `notifications` "emailing" the customer is now wired and proven working
  together, not just individually.
