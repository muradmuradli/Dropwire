# 0019: Prometheus metrics across all six services, with Grafana provisioned on top

## Context
Every service already logs structured JSON with a `correlationId` (`infra/observability/README.md`
called this "enough to follow a request/saga across logs manually, for now"). That's fine for
debugging one request after the fact, but there was no way to *see* the saga as a whole — request
rates, latency, and the saga's actual outcome mix (how many orders get reserved vs. cancelled, how
often payments fail) — especially useful while running a load test. Scoped to metrics only this
pass; distributed tracing (OpenTelemetry spans across HTTP → gRPC → Kafka) is a separate, later
piece.

## Decision
- **Raw `prom-client` directly, not a NestJS-specific wrapper package** (e.g.
  `@willsoto/nestjs-prometheus`). Matches this project's existing taste for explicit control over a
  framework-abstraction layer — the same reasoning as using raw `kafkajs` instead of
  `@nestjs/microservices`'s Kafka transport (`docs/decisions/0013`). `prom-client` is plain
  CommonJS with no ESM-only trap (unlike `@nestjs/schedule@^12`, pinned to `6.1.3` for exactly that
  reason).
- **Every service gets its own `src/metrics/` module** (`MetricsService`, `MetricsController` at
  `GET /metrics`, `HttpMetricsMiddleware`, `MetricsModule`) — duplicated six times, not shared code,
  per the root `CLAUDE.md`'s "no code sharing between services" rule. `MetricsModule` is `@Global()`
  within each service (matching the existing precedent set by `notifications`' `KafkaModule`) so any
  business service can inject `MetricsService` without every consumer re-importing the module.
- **`HttpMetricsMiddleware` records `http_request_duration_seconds{method,route,status}`** for
  every HTTP service (including `gateway`'s proxy routes — the whole forward-and-respond cycle
  counts as the request's duration). The `route` label uses Express's matched route pattern
  (`req.route.path`, e.g. `/products/:id`), never the raw request path — using the raw path would
  let an attacker (or just real traffic) blow up Prometheus's label cardinality with one time series
  per distinct id ever requested.
- **Business counters live beside the domain logic they measure, not inside `MetricsService`**:
  each one is constructed in the owning service's constructor (`inventory_reservations_total`,
  `inventory_releases_total` in `ReservationService`; `orders_placed_total`,
  `orders_saga_outcomes_total` in `OrdersService`; `payments_processed_total` in `PaymentService`;
  `notifications_sent_total` in `NotificationService`; `gateway_proxy_requests_total` in
  `ProxyService`), registered against the shared `MetricsService.registry` passed in. Incremented
  only on a genuine fresh terminal outcome — never on an idempotent replay/duplicate-event
  short-circuit — so a redelivered Kafka message or a retried gRPC call can't inflate the count of
  real attempts. `catalog` gets no business counters; its only meaningful signal is the HTTP
  histogram it already has.
- **Prometheus scrapes `host.docker.internal:<port>/metrics`** for all six services
  (`infra/observability/prometheus/prometheus.yml`), not service-name targets — the app services run
  on the host during local dev (`pnpm --filter <svc> run start:dev`), not inside `docker
  compose`'s network, unlike every other piece of infra. `extra_hosts: host-gateway` makes the same
  compose file work on Linux too, where `host.docker.internal` isn't automatic the way it is on
  Docker Desktop.
- **Grafana is fully provisioned, not clicked together by hand**: a datasource
  (`infra/observability/grafana/provisioning/datasources/`) and one dashboard
  (`infra/observability/grafana/provisioning/dashboards/dropwire-saga.json`) load automatically on
  container start. The dashboard covers HTTP rate/p95 latency per service plus every business
  counter above, so the saga's live behavior is visible without writing a single PromQL query by
  hand first.

## Consequences
- **Verified for real, against the complete running stack**: started all six services plus
  Prometheus and Grafana, confirmed all six scrape targets report `up`, then drove one real order
  through the *entire* saga (`gateway` → `orders` → `inventory` gRPC → `payments` Kafka → `orders`
  → `notifications` Kafka) using a throwaway fake-JWKS JWT (same technique as prior sessions' e2e
  tests) and watched every single business counter — `orders_placed_total`,
  `orders_saga_outcomes_total`, `inventory_reservations_total`, `payments_processed_total`,
  `notifications_sent_total`, `gateway_proxy_requests_total` — actually increment and become
  queryable in Prometheus afterward. Confirmed Grafana's provisioned datasource and dashboard loaded
  automatically with all 10 panels, and that the dashboard's own p95-latency query returns real
  per-service numbers.
- **Found and fixed a mistake made during this verification, not a pre-existing bug**: a
  `prisma.stock.deleteMany({ where: { productId: undefined } })` call, intended to remove one stray
  test row, instead wiped every row in inventory's `Stock` table — Prisma treats a filter field set
  to `undefined` as "no filter at all," not "match nothing." This deleted the `p1`/`p2` fixture
  rows left over from the very first inventory session. Restored both with `totalQuantity: 100`
  (the original quantities weren't recorded anywhere outside the live database, so this is a
  best-effort restore, not a guaranteed match) — worth knowing if a future session's manual testing
  expects a specific number there.
- 4 new unit tests for `ProxyService` already covered its 503 path; no new unit tests were added
  *for the metric increments themselves* — the live end-to-end verification above is what actually
  exercises every counter's label and increment-only-on-success logic, which a unit test asserting
  "this counter's internal value went up" would mostly duplicate.
- **Not done**: no gRPC-specific duration metric for `inventory`'s `ReserveStock`/`ReleaseStock` —
  `HttpMetricsMiddleware` only wraps the HTTP/Express transport, not the gRPC microservice
  transport, so that latency isn't in the histogram (the business counters still capture its
  outcome, just not its duration). Distributed tracing is still a separate, later piece per the
  scope decision above.
