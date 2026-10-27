# Observability

Metrics are implemented. Distributed tracing (OpenTelemetry, following one request across HTTP →
gRPC → Kafka) is a separate, later piece — not yet built. Every service still also logs structured
JSON (via `nestjs-pino`) with a `correlationId` field, which remains the way to follow one
request/saga across logs by hand.

## Metrics

Every service (`gateway`, `catalog`, `inventory`, `orders`, `payments`, `notifications`) exposes
`GET /metrics` in Prometheus text format: default Node.js/process metrics, an
`http_request_duration_seconds` histogram for every HTTP request, and a handful of
business-specific counters next to the domain logic they measure (`orders_placed_total`,
`inventory_reservations_total`, `payments_processed_total`, `notifications_sent_total`,
`gateway_proxy_requests_total`). Full reasoning in
[`docs/decisions/0019`](../../docs/decisions/0019-prometheus-metrics.md).

`docker compose up -d` now also starts `prometheus` (scraping all six services at
`host.docker.internal:<port>/metrics` — they run on the host during local dev, not in this compose
network) and `grafana` (`http://localhost:3200`, `admin`/`admin`), both pre-provisioned: a
"Dropwire saga overview" dashboard is there on first load, no manual setup. Config lives in
`infra/observability/prometheus/` and `infra/observability/grafana/provisioning/`.
